import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSshTunnelService } from '../system/ssh-tunnel/ssh-tunnel.service';
import { SshTunnelService } from './ssh-tunnel.service';

function makeDeps() {
  const prisma = {
    sshTunnelConfig: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  const systemTunnel = {
    savePrivateKey: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    removeKey: jest.fn(),
    status: jest.fn(),
    testConnection: jest.fn(),
  };
  return { prisma, systemTunnel };
}

type Deps = ReturnType<typeof makeDeps>;

// Cast once at a single well-known boundary rather than sprinkling `as any`
// through every test, mirroring AppsService's spec.
function makeService(deps: Deps): SshTunnelService {
  return new SshTunnelService(
    deps.prisma as unknown as PrismaService,
    deps.systemTunnel as unknown as SystemSshTunnelService,
  );
}

const CONFIGURED_ROW = {
  id: 'row-1',
  host: 'relay.example.com',
  port: 22,
  username: 'ubuntu',
  localProxyPort: 1080,
  privateKeyPath: '/etc/persia-panel/ssh-tunnel/id_tunnel',
  enabled: true,
  lastError: null,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('SshTunnelService', () => {
  describe('getStatus', () => {
    it('reports unconfigured when no row exists yet', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(null);
      const service = makeService({ prisma, systemTunnel });

      const result = await service.getStatus();

      expect(result).toEqual({
        configured: false,
        active: false,
        enabled: false,
        hasPrivateKey: false,
      });
      expect(systemTunnel.status).not.toHaveBeenCalled();
    });

    it('merges the persisted config with live systemd status and never leaks the key path', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(CONFIGURED_ROW);
      systemTunnel.status.mockResolvedValue({ active: true, enabled: true });
      const service = makeService({ prisma, systemTunnel });

      const result = await service.getStatus();

      expect(result).toEqual({
        configured: true,
        id: 'row-1',
        host: 'relay.example.com',
        port: 22,
        username: 'ubuntu',
        localProxyPort: 1080,
        enabled: true,
        lastError: null,
        updatedAt: CONFIGURED_ROW.updatedAt,
        hasPrivateKey: true,
        active: true,
      });
      expect(result).not.toHaveProperty('privateKeyPath');
    });
  });

  describe('save validation', () => {
    it('rejects when no private key is supplied and none exists yet', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(null);
      const service = makeService({ prisma, systemTunnel });

      await expect(
        service.save({ host: 'relay.example.com', username: 'ubuntu' }),
      ).rejects.toThrow(BadRequestException);
      expect(systemTunnel.start).not.toHaveBeenCalled();
    });

    it('rejects an invalid host before touching the private key or starting the tunnel', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(null);
      const service = makeService({ prisma, systemTunnel });

      await expect(
        service.save({
          host: 'bad host',
          username: 'ubuntu',
          privateKey: 'pem-content',
        }),
      ).rejects.toThrow('Invalid tunnel host');
      expect(systemTunnel.savePrivateKey).not.toHaveBeenCalled();
      expect(systemTunnel.start).not.toHaveBeenCalled();
    });

    it('rejects an invalid username before touching the private key or starting the tunnel', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(null);
      const service = makeService({ prisma, systemTunnel });

      await expect(
        service.save({
          host: 'relay.example.com',
          username: 'bad user',
          privateKey: 'pem-content',
        }),
      ).rejects.toThrow('Invalid tunnel username');
      expect(systemTunnel.savePrivateKey).not.toHaveBeenCalled();
      expect(systemTunnel.start).not.toHaveBeenCalled();
    });

    it('wraps a rejected savePrivateKey as a BadRequestException', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(null);
      systemTunnel.savePrivateKey.mockRejectedValue(
        new Error('Does not look like a private key'),
      );
      const service = makeService({ prisma, systemTunnel });

      await expect(
        service.save({
          host: 'relay.example.com',
          username: 'ubuntu',
          privateKey: 'not-a-key',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(systemTunnel.start).not.toHaveBeenCalled();
    });
  });

  describe('save happy paths', () => {
    it('reuses the existing private key path when updating without a new key', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(CONFIGURED_ROW);
      prisma.sshTunnelConfig.update.mockResolvedValue({
        ...CONFIGURED_ROW,
        port: 2222,
      });
      const service = makeService({ prisma, systemTunnel });

      const result = await service.save({
        host: 'relay.example.com',
        username: 'ubuntu',
        port: 2222,
      });

      expect(systemTunnel.savePrivateKey).not.toHaveBeenCalled();
      expect(systemTunnel.start).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKeyPath: CONFIGURED_ROW.privateKeyPath,
          port: 2222,
        }),
      );
      expect(prisma.sshTunnelConfig.update).toHaveBeenCalledWith({
        where: { id: CONFIGURED_ROW.id },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ port: 2222, lastError: null }),
      });
      expect(result).not.toHaveProperty('privateKeyPath');
      expect(result.hasPrivateKey).toBe(true);
    });

    it('creates a new row and starts the tunnel when configuring for the first time', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(null);
      systemTunnel.savePrivateKey.mockResolvedValue(
        '/etc/persia-panel/ssh-tunnel/id_tunnel',
      );
      prisma.sshTunnelConfig.create.mockResolvedValue(CONFIGURED_ROW);
      const service = makeService({ prisma, systemTunnel });

      const result = await service.save({
        host: 'relay.example.com',
        username: 'ubuntu',
        privateKey: 'pem-content',
      });

      expect(systemTunnel.start).toHaveBeenCalledWith({
        host: 'relay.example.com',
        port: 22,
        username: 'ubuntu',
        localProxyPort: 1080,
        privateKeyPath: '/etc/persia-panel/ssh-tunnel/id_tunnel',
      });
      expect(prisma.sshTunnelConfig.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          host: 'relay.example.com',
          username: 'ubuntu',
          lastError: null,
        }),
      });
      expect(result.hasPrivateKey).toBe(true);
    });

    it('stops the tunnel instead of starting it when enabled is explicitly false', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(CONFIGURED_ROW);
      prisma.sshTunnelConfig.update.mockResolvedValue({
        ...CONFIGURED_ROW,
        enabled: false,
      });
      const service = makeService({ prisma, systemTunnel });

      await service.save({
        host: 'relay.example.com',
        username: 'ubuntu',
        enabled: false,
      });

      expect(systemTunnel.stop).toHaveBeenCalled();
      expect(systemTunnel.start).not.toHaveBeenCalled();
    });

    it('persists lastError and rethrows InternalServerErrorException when start() fails', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(CONFIGURED_ROW);
      systemTunnel.start.mockRejectedValue(
        new Error('ssh: connect to host relay.example.com port 22: timed out'),
      );
      prisma.sshTunnelConfig.update.mockResolvedValue({
        ...CONFIGURED_ROW,
        lastError: 'ssh: connect to host relay.example.com port 22: timed out',
      });
      const service = makeService({ prisma, systemTunnel });

      await expect(
        service.save({ host: 'relay.example.com', username: 'ubuntu' }),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prisma.sshTunnelConfig.update).toHaveBeenCalledWith({
        where: { id: CONFIGURED_ROW.id },
        data: expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          lastError: expect.stringContaining('timed out'),
        }) as unknown,
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing is configured', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(null);
      const service = makeService({ prisma, systemTunnel });

      await expect(service.remove()).rejects.toThrow(NotFoundException);
      expect(systemTunnel.stop).not.toHaveBeenCalled();
    });

    it('stops the tunnel, removes the key, and deletes the row', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(CONFIGURED_ROW);
      const service = makeService({ prisma, systemTunnel });

      const result = await service.remove();

      expect(systemTunnel.stop).toHaveBeenCalled();
      expect(systemTunnel.removeKey).toHaveBeenCalled();
      expect(prisma.sshTunnelConfig.delete).toHaveBeenCalledWith({
        where: { id: CONFIGURED_ROW.id },
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('testConnection', () => {
    it('throws NotFoundException when nothing is configured', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(null);
      const service = makeService({ prisma, systemTunnel });

      await expect(service.testConnection()).rejects.toThrow(NotFoundException);
    });

    it('returns the public IP observed through the tunnel on success', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(CONFIGURED_ROW);
      systemTunnel.testConnection.mockResolvedValue('203.0.113.9');
      const service = makeService({ prisma, systemTunnel });

      const result = await service.testConnection();

      expect(systemTunnel.testConnection).toHaveBeenCalledWith(1080);
      expect(result).toEqual({ success: true, publicIp: '203.0.113.9' });
    });

    it('wraps a failed test as InternalServerErrorException', async () => {
      const { prisma, systemTunnel } = makeDeps();
      prisma.sshTunnelConfig.findFirst.mockResolvedValue(CONFIGURED_ROW);
      systemTunnel.testConnection.mockRejectedValue(
        new Error('curl: (7) Failed to connect'),
      );
      const service = makeService({ prisma, systemTunnel });

      await expect(service.testConnection()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
