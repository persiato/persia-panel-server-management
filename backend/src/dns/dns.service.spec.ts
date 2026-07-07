import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemDnsService } from '../system/dns/dns.service';
import { DnsService } from './dns.service';

function makeDeps() {
  const prisma = {
    domain: { findUnique: jest.fn() },
    dnsRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const systemDns = {
    writeZone: jest.fn().mockResolvedValue(undefined),
  };
  return { prisma, systemDns };
}

type Deps = ReturnType<typeof makeDeps>;

function makeService(deps: Deps): DnsService {
  return new DnsService(
    deps.prisma as unknown as PrismaService,
    deps.systemDns as unknown as SystemDnsService,
  );
}

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';
const DOMAIN = { id: 'domain-1', name: 'example.com', ownerId: OWNER_ID };

describe('DnsService', () => {
  describe('list', () => {
    it('throws NotFoundException for a domain owned by someone else (non-admin)', async () => {
      const { prisma, systemDns } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      const service = makeService({ prisma, systemDns });

      await expect(
        service.list(DOMAIN.id, OTHER_OWNER_ID, false),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows an admin to list records for any domain', async () => {
      const { prisma, systemDns } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.dnsRecord.findMany.mockResolvedValue([{ id: 'rec-1' }]);
      const service = makeService({ prisma, systemDns });

      const result = await service.list(DOMAIN.id, OTHER_OWNER_ID, true);
      expect(result).toEqual([{ id: 'rec-1' }]);
    });
  });

  describe('create', () => {
    it('rejects an invalid record name', async () => {
      const { prisma, systemDns } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      const service = makeService({ prisma, systemDns });

      await expect(
        service.create(OWNER_ID, false, {
          domainId: DOMAIN.id,
          type: 'A',
          name: 'bad name with spaces',
          value: '203.0.113.10',
        } as never),
      ).rejects.toThrow(BadRequestException);
      expect(systemDns.writeZone).not.toHaveBeenCalled();
    });

    it('rejects a value that does not match the record type', async () => {
      const { prisma, systemDns } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      const service = makeService({ prisma, systemDns });

      await expect(
        service.create(OWNER_ID, false, {
          domainId: DOMAIN.id,
          type: 'A',
          name: '@',
          value: 'not-an-ip',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an MX record with an out-of-range priority', async () => {
      const { prisma, systemDns } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      const service = makeService({ prisma, systemDns });

      await expect(
        service.create(OWNER_ID, false, {
          domainId: DOMAIN.id,
          type: 'MX',
          name: '@',
          value: 'mail.example.com',
          priority: 99999,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the record and regenerates the zone from every current record', async () => {
      const { prisma, systemDns } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.dnsRecord.create.mockResolvedValue({
        id: 'rec-1',
        domainId: DOMAIN.id,
        type: 'A',
        name: '@',
        value: '203.0.113.10',
        ttl: 3600,
        priority: null,
      });
      prisma.dnsRecord.findMany.mockResolvedValue([
        {
          type: 'A',
          name: '@',
          value: '203.0.113.10',
          ttl: 3600,
          priority: null,
        },
      ]);
      const service = makeService({ prisma, systemDns });

      const result = await service.create(OWNER_ID, false, {
        domainId: DOMAIN.id,
        type: 'A',
        name: '@',
        value: '203.0.113.10',
      } as never);

      expect(result.id).toBe('rec-1');
      expect(systemDns.writeZone).toHaveBeenCalledWith('example.com', [
        {
          type: 'A',
          name: '@',
          value: '203.0.113.10',
          ttl: 3600,
          priority: null,
        },
      ]);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for a record belonging to another owner', async () => {
      const { prisma, systemDns } = makeDeps();
      prisma.dnsRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        domainId: DOMAIN.id,
        domain: DOMAIN,
      });
      const service = makeService({ prisma, systemDns });

      await expect(
        service.remove('rec-1', OTHER_OWNER_ID, false),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.dnsRecord.delete).not.toHaveBeenCalled();
    });

    it('deletes the record and regenerates the zone', async () => {
      const { prisma, systemDns } = makeDeps();
      prisma.dnsRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        domainId: DOMAIN.id,
        domain: DOMAIN,
      });
      const service = makeService({ prisma, systemDns });

      const result = await service.remove('rec-1', OWNER_ID, false);
      expect(result).toEqual({ success: true });
      expect(prisma.dnsRecord.delete).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
      });
      expect(systemDns.writeZone).toHaveBeenCalledWith('example.com', []);
    });
  });
});
