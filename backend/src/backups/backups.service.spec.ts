import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from '../system/backup/backup.service';
import { SystemBackupDestinationService } from '../system/backup-destination/backup-destination.service';
import { BackupsService } from './backups.service';

function makeDeps() {
  const prisma = {
    domain: { findUnique: jest.fn() },
    database: { findMany: jest.fn() },
    backup: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    // No offsite destination configured by default — pushOffsite() is a
    // no-op unless a test explicitly sets this up, so existing local-only
    // backup behavior is unaffected.
    backupDestinationConfig: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
  };
  const backup = {
    create: jest.fn(),
    restore: jest.fn(),
    remove: jest.fn(),
    filePath: jest.fn(),
  };
  const destination = {
    push: jest.fn(),
    remove: jest.fn(),
  };
  return { prisma, backup, destination };
}

type Deps = ReturnType<typeof makeDeps>;

// Test doubles only implement the handful of Prisma/BackupService members
// BackupsService actually touches — cast once here, at a single well-known
// boundary, instead of sprinkling `as any` through every test.
function makeService(deps: Partial<Deps> & Pick<Deps, 'prisma' | 'backup'>): BackupsService {
  return new BackupsService(
    deps.prisma as unknown as PrismaService,
    deps.backup as unknown as BackupService,
    (deps.destination ?? makeDeps().destination) as unknown as SystemBackupDestinationService,
  );
}

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';
const DOMAIN = {
  id: 'domain-1',
  name: 'example.com',
  ownerId: OWNER_ID,
  documentRoot: '/var/www/example.com',
};

describe('BackupsService', () => {
  describe('create', () => {
    it('creates a COMPLETE backup row on success', async () => {
      const { prisma, backup } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.database.findMany.mockResolvedValue([]);
      backup.create.mockResolvedValue({
        fileName: 'backup-x.tar.gz',
        sizeBytes: 1234,
      });
      prisma.backup.create.mockResolvedValue({ id: 'b1', status: 'COMPLETE' });

      const service = makeService({ prisma, backup });
      const result = await service.create(OWNER_ID, false, {
        domainId: DOMAIN.id,
      });

      expect(backup.create).toHaveBeenCalledWith(DOMAIN, []);
      expect(prisma.backup.create).toHaveBeenCalledWith({
        data: {
          domainId: DOMAIN.id,
          fileName: 'backup-x.tar.gz',
          sizeBytes: 1234,
          status: 'COMPLETE',
        },
      });
      expect(result).toEqual({ id: 'b1', status: 'COMPLETE' });
    });

    it('records a FAILED row with the error message and still throws when the underlying backup fails', async () => {
      const { prisma, backup } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.database.findMany.mockResolvedValue([]);
      backup.create.mockRejectedValue(new Error('tar exited with code 2'));
      prisma.backup.create.mockResolvedValue({ id: 'b2', status: 'FAILED' });

      const service = makeService({ prisma, backup });

      await expect(
        service.create(OWNER_ID, false, { domainId: DOMAIN.id }),
      ).rejects.toThrow('Failed to create backup: tar exited with code 2');

      expect(prisma.backup.create).toHaveBeenCalledWith({
        data: {
          domainId: DOMAIN.id,
          fileName: '',
          sizeBytes: 0,
          status: 'FAILED',
          error: 'tar exited with code 2',
        },
      });
    });

    it('throws NotFoundException for a domain owned by someone else (non-admin)', async () => {
      const { prisma, backup } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);

      const service = makeService({ prisma, backup });

      await expect(
        service.create(OTHER_OWNER_ID, false, { domainId: DOMAIN.id }),
      ).rejects.toThrow(NotFoundException);
      expect(backup.create).not.toHaveBeenCalled();
    });

    it('allows an admin to back up a domain they do not own', async () => {
      const { prisma, backup } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.database.findMany.mockResolvedValue([]);
      backup.create.mockResolvedValue({
        fileName: 'backup-x.tar.gz',
        sizeBytes: 1,
      });
      prisma.backup.create.mockResolvedValue({ id: 'b3', status: 'COMPLETE' });

      const service = makeService({ prisma, backup });
      await expect(
        service.create(OTHER_OWNER_ID, true, { domainId: DOMAIN.id }),
      ).resolves.toEqual({ id: 'b3', status: 'COMPLETE' });
    });
  });

  describe('ownership checks (findOwned via restore/remove/getDownloadPath)', () => {
    const OWNED_BACKUP = {
      id: 'b1',
      fileName: 'backup-x.tar.gz',
      status: 'COMPLETE',
      domainId: DOMAIN.id,
      domain: DOMAIN,
    };

    it('getDownloadPath throws NotFoundException when the backup belongs to another owner', async () => {
      const { prisma, backup } = makeDeps();
      prisma.backup.findUnique.mockResolvedValue(OWNED_BACKUP);
      const service = makeService({ prisma, backup });
      await expect(
        service.getDownloadPath('b1', OTHER_OWNER_ID, false),
      ).rejects.toThrow(NotFoundException);
    });

    it('getDownloadPath throws NotFoundException when the backup is not COMPLETE', async () => {
      const { prisma, backup } = makeDeps();
      prisma.backup.findUnique.mockResolvedValue({
        ...OWNED_BACKUP,
        status: 'PENDING',
      });
      const service = makeService({ prisma, backup });
      await expect(
        service.getDownloadPath('b1', OWNER_ID, false),
      ).rejects.toThrow('Backup file not available');
    });

    it('getDownloadPath resolves the file path for the owner', async () => {
      const { prisma, backup } = makeDeps();
      prisma.backup.findUnique.mockResolvedValue(OWNED_BACKUP);
      backup.filePath.mockReturnValue(
        '/var/backups/persia-panel/example.com/backup-x.tar.gz',
      );
      const service = makeService({ prisma, backup });
      const result = await service.getDownloadPath('b1', OWNER_ID, false);
      expect(backup.filePath).toHaveBeenCalledWith(
        'example.com',
        'backup-x.tar.gz',
      );
      expect(result).toEqual({
        path: '/var/backups/persia-panel/example.com/backup-x.tar.gz',
        fileName: 'backup-x.tar.gz',
      });
    });

    it('remove deletes both the archive and the DB row when COMPLETE', async () => {
      const { prisma, backup } = makeDeps();
      prisma.backup.findUnique.mockResolvedValue(OWNED_BACKUP);
      backup.remove.mockResolvedValue(undefined);
      prisma.backup.delete.mockResolvedValue(undefined);
      const service = makeService({ prisma, backup });

      await expect(service.remove('b1', OWNER_ID, false)).resolves.toEqual({
        success: true,
      });
      expect(backup.remove).toHaveBeenCalledWith(
        'example.com',
        'backup-x.tar.gz',
      );
      expect(prisma.backup.delete).toHaveBeenCalledWith({
        where: { id: 'b1' },
      });
    });

    it('remove skips the filesystem delete but still removes the row for a FAILED backup', async () => {
      const { prisma, backup } = makeDeps();
      prisma.backup.findUnique.mockResolvedValue({
        ...OWNED_BACKUP,
        status: 'FAILED',
      });
      prisma.backup.delete.mockResolvedValue(undefined);
      const service = makeService({ prisma, backup });

      await expect(service.remove('b1', OWNER_ID, false)).resolves.toEqual({
        success: true,
      });
      expect(backup.remove).not.toHaveBeenCalled();
      expect(prisma.backup.delete).toHaveBeenCalledWith({
        where: { id: 'b1' },
      });
    });

    it('restore rejects a non-COMPLETE backup', async () => {
      const { prisma, backup } = makeDeps();
      prisma.backup.findUnique.mockResolvedValue({
        ...OWNED_BACKUP,
        status: 'FAILED',
      });
      const service = makeService({ prisma, backup });
      await expect(service.restore('b1', OWNER_ID, false)).rejects.toThrow(
        'Backup file not available',
      );
    });

    it('restore wraps underlying restore failures in InternalServerErrorException', async () => {
      const { prisma, backup } = makeDeps();
      prisma.backup.findUnique.mockResolvedValue(OWNED_BACKUP);
      prisma.database.findMany.mockResolvedValue([]);
      backup.restore.mockRejectedValue(new Error('mysql exited with code 1'));
      const service = makeService({ prisma, backup });
      await expect(service.restore('b1', OWNER_ID, false)).rejects.toThrow(
        'Failed to restore backup: mysql exited with code 1',
      );
    });
  });
});
