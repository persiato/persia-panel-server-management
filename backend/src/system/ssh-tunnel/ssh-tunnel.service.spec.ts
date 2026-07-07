import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  isValidHost,
  isValidPrivateKey,
  isValidTunnelUsername,
  SshTunnelParams,
  SystemSshTunnelService,
} from './ssh-tunnel.service';

const SAMPLE_KEY = [
  '-----BEGIN OPENSSH PRIVATE KEY-----',
  'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
  '-----END OPENSSH PRIVATE KEY-----',
].join('\n');

// The unit-render/start/status/testConnection paths shell out to
// systemctl/curl, which we don't want to exercise for real in tests — the
// same reasoning as AppInstallerService's spec. We reach the private
// renderUnit/unitPath helpers through a narrow internal-shape cast (mirrors
// the FirewallService/AppInstallerService pattern) so the generated systemd
// unit contents can be asserted directly without mocking child_process.
interface SystemSshTunnelServiceInternal {
  renderUnit(params: SshTunnelParams): string;
  unitPath(): string;
}

function internal(
  service: SystemSshTunnelService,
): SystemSshTunnelServiceInternal {
  return service as unknown as SystemSshTunnelServiceInternal;
}

function makeService(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    SSH_TUNNEL_KEY_DIR: '/etc/persia-panel/ssh-tunnel',
    SYSTEMD_UNIT_DIR: '/etc/systemd/system',
    ...overrides,
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
  return new SystemSshTunnelService(config as unknown as ConfigService);
}

describe('isValidHost', () => {
  it('accepts plain hostnames, FQDNs, and IPv4/IPv6 addresses', () => {
    expect(isValidHost('relay.example.com')).toBe(true);
    expect(isValidHost('bastion')).toBe(true);
    expect(isValidHost('203.0.113.4')).toBe(true);
    expect(isValidHost('2001:db8::1')).toBe(true);
  });

  it('rejects shell-hostile or empty input', () => {
    expect(isValidHost('')).toBe(false);
    expect(isValidHost('relay.example.com; rm -rf /')).toBe(false);
    expect(isValidHost('host with spaces')).toBe(false);
    expect(isValidHost('-leading-hyphen.com')).toBe(false);
  });
});

describe('isValidTunnelUsername', () => {
  it('accepts typical unix usernames', () => {
    expect(isValidTunnelUsername('ubuntu')).toBe(true);
    expect(isValidTunnelUsername('deploy-bot_1')).toBe(true);
  });

  it('rejects empty, overlong, or shell-hostile usernames', () => {
    expect(isValidTunnelUsername('')).toBe(false);
    expect(isValidTunnelUsername('a'.repeat(33))).toBe(false);
    expect(isValidTunnelUsername('root; id')).toBe(false);
    expect(isValidTunnelUsername('user name')).toBe(false);
  });
});

describe('isValidPrivateKey', () => {
  it('accepts PEM blocks with a recognizable header', () => {
    expect(isValidPrivateKey(SAMPLE_KEY)).toBe(true);
    expect(
      isValidPrivateKey(
        '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----',
      ),
    ).toBe(true);
  });

  it('rejects anything without a PRIVATE KEY header', () => {
    expect(isValidPrivateKey('not a key at all')).toBe(false);
    expect(isValidPrivateKey('-----BEGIN CERTIFICATE-----')).toBe(false);
  });
});

describe('SystemSshTunnelService', () => {
  describe('savePrivateKey', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-ssh-tunnel-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('rejects content that does not look like a private key without touching disk', async () => {
      const service = makeService({ SSH_TUNNEL_KEY_DIR: tmpDir });
      await expect(service.savePrivateKey('not a key')).rejects.toThrow(
        /private key/i,
      );
    });

    it('writes the key with 0600 permissions and a trailing newline', async () => {
      const keyDir = path.join(tmpDir, 'ssh-tunnel');
      const service = makeService({ SSH_TUNNEL_KEY_DIR: keyDir });

      const keyPath = await service.savePrivateKey(SAMPLE_KEY);
      expect(keyPath).toBe(path.join(keyDir, 'id_tunnel'));

      const content = await fs.readFile(keyPath, 'utf8');
      expect(content).toBe(SAMPLE_KEY + '\n');

      const stat = await fs.stat(keyPath);
      expect(stat.mode & 0o777).toBe(0o600);

      const dirStat = await fs.stat(keyDir);
      expect(dirStat.mode & 0o777).toBe(0o700);
    });

    it('creates an empty known_hosts file alongside the key if missing', async () => {
      const keyDir = path.join(tmpDir, 'ssh-tunnel');
      const service = makeService({ SSH_TUNNEL_KEY_DIR: keyDir });

      await service.savePrivateKey(SAMPLE_KEY);

      const knownHosts = await fs.readFile(
        path.join(keyDir, 'known_hosts'),
        'utf8',
      );
      expect(knownHosts).toBe('');
    });
  });

  describe('renderUnit (private)', () => {
    it('produces a systemd unit that dynamic-forwards through the requested port and key', () => {
      const service = makeService();
      const unit = internal(service).renderUnit({
        host: 'relay.example.com',
        port: 2222,
        username: 'tunneluser',
        localProxyPort: 1080,
        privateKeyPath: '/etc/persia-panel/ssh-tunnel/id_tunnel',
      });

      expect(unit).toContain(
        'ExecStart=/usr/bin/ssh -N -D 127.0.0.1:1080 -i /etc/persia-panel/ssh-tunnel/id_tunnel -p 2222',
      );
      expect(unit).toContain('tunneluser@relay.example.com');
      expect(unit).toContain('StrictHostKeyChecking=accept-new');
      expect(unit).toContain('Restart=always');
      expect(unit).toContain(
        'UserKnownHostsFile=/etc/persia-panel/ssh-tunnel/known_hosts',
      );
    });
  });

  describe('start validation', () => {
    it('rejects an invalid host before writing any unit file', async () => {
      const service = makeService();
      await expect(
        service.start({
          host: 'bad host',
          port: 22,
          username: 'ubuntu',
          localProxyPort: 1080,
          privateKeyPath: '/tmp/key',
        }),
      ).rejects.toThrow('Invalid tunnel host');
    });

    it('rejects an invalid username before writing any unit file', async () => {
      const service = makeService();
      await expect(
        service.start({
          host: 'relay.example.com',
          port: 22,
          username: 'bad user',
          localProxyPort: 1080,
          privateKeyPath: '/tmp/key',
        }),
      ).rejects.toThrow('Invalid tunnel username');
    });

    it('rejects an out-of-range SSH port', async () => {
      const service = makeService();
      await expect(
        service.start({
          host: 'relay.example.com',
          port: 70000,
          username: 'ubuntu',
          localProxyPort: 1080,
          privateKeyPath: '/tmp/key',
        }),
      ).rejects.toThrow('SSH port must be an integer between 1 and 65535');
    });

    it('rejects a local proxy port below 1024', async () => {
      const service = makeService();
      await expect(
        service.start({
          host: 'relay.example.com',
          port: 22,
          username: 'ubuntu',
          localProxyPort: 80,
          privateKeyPath: '/tmp/key',
        }),
      ).rejects.toThrow(
        'Local proxy port must be an integer between 1024 and 65535',
      );
    });
  });

  describe('status', () => {
    it('returns inactive/disabled when systemctl calls fail (e.g. unit not installed)', async () => {
      const service = makeService();
      const result = await service.status();
      // On a machine without the unit installed (or without systemctl at
      // all, e.g. this test sandbox), both calls reject and status() must
      // degrade to false/false rather than throwing.
      expect(result).toEqual({ active: false, enabled: false });
    });
  });
});
