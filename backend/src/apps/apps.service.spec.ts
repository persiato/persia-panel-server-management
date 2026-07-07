import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppInstallerService } from '../system/app-installer/app-installer.service';
import { DbProvisionerService } from '../system/db-provisioner/db-provisioner.service';
import { AppsService } from './apps.service';

function makeDeps() {
  const prisma = {
    domain: { findUnique: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
    database: {
      create: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    installedApp: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };
  const appInstaller = {
    listCatalog: jest.fn(),
    getDefinition: jest.fn(),
    install: jest.fn(),
    remove: jest.fn(),
  };
  const provisioner = {
    generatePassword: jest.fn().mockReturnValue('generated-password'),
    createMysqlDatabase: jest.fn().mockResolvedValue(undefined),
    dropMysqlDatabase: jest.fn().mockResolvedValue(undefined),
    dropPostgresDatabase: jest.fn().mockResolvedValue(undefined),
  };
  return { prisma, appInstaller, provisioner };
}

type Deps = ReturnType<typeof makeDeps>;

// Cast once at a single well-known boundary rather than sprinkling `as any`
// through every test, mirroring BackupsService's spec.
function makeService(deps: Deps): AppsService {
  return new AppsService(
    deps.prisma as unknown as PrismaService,
    deps.appInstaller as unknown as AppInstallerService,
    deps.provisioner as unknown as DbProvisionerService,
  );
}

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';
// Deliberately a path that will not exist on the test machine's filesystem,
// so the existsSync()+readdir() "is target dir empty" check short-circuits
// on existsSync() alone.
const DOMAIN = {
  id: 'domain-1',
  name: 'example.com',
  ownerId: OWNER_ID,
  documentRoot: '/nonexistent/pp-apps-test/example.com',
};

const PHPMYADMIN_DEF = {
  id: 'phpmyadmin',
  name: 'phpMyAdmin',
  description: '',
  version: '5.2.1',
  requiresDatabase: false,
  downloadUrlEnvVar: 'PHPMYADMIN_DOWNLOAD_URL',
  defaultDownloadUrl: 'https://example.com/phpmyadmin.tar.gz',
  archiveRootDir: 'phpMyAdmin',
};

const WORDPRESS_DEF = {
  id: 'wordpress',
  name: 'WordPress',
  description: '',
  version: 'latest',
  requiresDatabase: true,
  downloadUrlEnvVar: 'WORDPRESS_DOWNLOAD_URL',
  defaultDownloadUrl: 'https://example.com/wordpress.tar.gz',
  archiveRootDir: 'wordpress',
};

describe('AppsService', () => {
  describe('install', () => {
    it('throws NotFoundException for a domain owned by someone else (non-admin)', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      const service = makeService({ prisma, appInstaller, provisioner });

      await expect(
        service.install(OTHER_OWNER_ID, false, {
          domainId: DOMAIN.id,
          appId: 'phpmyadmin',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(appInstaller.install).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an unknown app id', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      appInstaller.getDefinition.mockImplementation(() => {
        throw new Error('Unknown app: bogus');
      });
      const service = makeService({ prisma, appInstaller, provisioner });

      await expect(
        service.install(OWNER_ID, false, {
          domainId: DOMAIN.id,
          appId: 'bogus',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an invalid targetPath', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      appInstaller.getDefinition.mockReturnValue(PHPMYADMIN_DEF);
      const service = makeService({ prisma, appInstaller, provisioner });

      await expect(
        service.install(OWNER_ID, false, {
          domainId: DOMAIN.id,
          appId: 'phpmyadmin',
          targetPath: '../escape',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when something is already installed at that path', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      appInstaller.getDefinition.mockReturnValue(PHPMYADMIN_DEF);
      prisma.installedApp.findFirst.mockResolvedValue({ id: 'existing' });
      const service = makeService({ prisma, appInstaller, provisioner });

      await expect(
        service.install(OWNER_ID, false, {
          domainId: DOMAIN.id,
          appId: 'phpmyadmin',
          targetPath: 'phpmyadmin',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('installs an app that does not require a database', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      appInstaller.getDefinition.mockReturnValue(PHPMYADMIN_DEF);
      appInstaller.install.mockResolvedValue({ version: '5.2.1' });
      prisma.installedApp.create.mockResolvedValue({
        id: 'ia-1',
        status: 'COMPLETE',
      });

      const service = makeService({ prisma, appInstaller, provisioner });
      const result = await service.install(OWNER_ID, false, {
        domainId: DOMAIN.id,
        appId: 'phpmyadmin',
        targetPath: 'phpmyadmin',
      });

      expect(provisioner.createMysqlDatabase).not.toHaveBeenCalled();
      expect(appInstaller.install).toHaveBeenCalledWith(
        'phpmyadmin',
        `${DOMAIN.documentRoot}/phpmyadmin`,
        undefined,
      );
      expect(prisma.installedApp.create).toHaveBeenCalledWith({
        data: {
          appId: 'phpmyadmin',
          version: '5.2.1',
          targetPath: 'phpmyadmin',
          status: 'COMPLETE',
          domainId: DOMAIN.id,
          databaseId: undefined,
        },
      });
      expect(result).toEqual({ id: 'ia-1', status: 'COMPLETE' });
    });

    it('provisions a database for an app that requires one and links it on success', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ username: 'alice' });
      appInstaller.getDefinition.mockReturnValue(WORDPRESS_DEF);
      appInstaller.install.mockResolvedValue({ version: 'latest' });
      prisma.database.create.mockResolvedValue({
        id: 'db-1',
        name: 'generated-name',
        username: 'generated-name',
      });
      prisma.installedApp.create.mockResolvedValue({
        id: 'ia-2',
        status: 'COMPLETE',
      });

      const service = makeService({ prisma, appInstaller, provisioner });
      await service.install(OWNER_ID, false, {
        domainId: DOMAIN.id,
        appId: 'wordpress',
      });

      expect(provisioner.createMysqlDatabase).toHaveBeenCalledTimes(1);
      expect(appInstaller.install).toHaveBeenCalledWith(
        'wordpress',
        DOMAIN.documentRoot,
        expect.objectContaining({
          host: 'localhost',
          password: 'generated-password',
        }),
      );

      expect(prisma.installedApp.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: 'COMPLETE',
          databaseId: 'db-1',
        }),
      });
    });

    it('rolls back the provisioned database and records a FAILED row when install fails', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ username: 'alice' });
      appInstaller.getDefinition.mockReturnValue(WORDPRESS_DEF);
      appInstaller.install.mockRejectedValue(
        new Error('curl exited with code 7'),
      );
      prisma.database.create.mockResolvedValue({
        id: 'db-1',
        name: 'generated-name',
        username: 'generated-name',
      });
      prisma.installedApp.create.mockResolvedValue({
        id: 'ia-3',
        status: 'FAILED',
      });

      const service = makeService({ prisma, appInstaller, provisioner });

      await expect(
        service.install(OWNER_ID, false, {
          domainId: DOMAIN.id,
          appId: 'wordpress',
        }),
      ).rejects.toThrow(InternalServerErrorException);

      expect(provisioner.dropMysqlDatabase).toHaveBeenCalledWith(
        'generated-name',
        'generated-name',
      );
      expect(prisma.database.delete).toHaveBeenCalledWith({
        where: { id: 'db-1' },
      });

      expect(prisma.installedApp.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'curl exited with code 7',
        }),
      });
    });
  });

  describe('remove', () => {
    const OWNED_APP = {
      id: 'ia-1',
      appId: 'wordpress',
      targetPath: 'blog',
      status: 'COMPLETE',
      domainId: DOMAIN.id,
      domain: DOMAIN,
      database: { id: 'db-1', name: 'db1', username: 'db1', engine: 'MYSQL' },
    };

    it('throws NotFoundException when the app belongs to another owner', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.installedApp.findUnique.mockResolvedValue(OWNED_APP);
      const service = makeService({ prisma, appInstaller, provisioner });

      await expect(
        service.remove('ia-1', OTHER_OWNER_ID, false),
      ).rejects.toThrow(NotFoundException);
      expect(appInstaller.remove).not.toHaveBeenCalled();
    });

    it('removes files, drops the linked database, and deletes the row', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.installedApp.findUnique.mockResolvedValue(OWNED_APP);
      appInstaller.remove.mockResolvedValue(undefined);
      const service = makeService({ prisma, appInstaller, provisioner });

      const result = await service.remove('ia-1', OWNER_ID, false);

      expect(appInstaller.remove).toHaveBeenCalledWith(
        `${DOMAIN.documentRoot}/blog`,
      );
      expect(provisioner.dropMysqlDatabase).toHaveBeenCalledWith('db1', 'db1');
      expect(prisma.database.delete).toHaveBeenCalledWith({
        where: { id: 'db-1' },
      });
      expect(prisma.installedApp.delete).toHaveBeenCalledWith({
        where: { id: 'ia-1' },
      });
      expect(result).toEqual({ success: true });
    });

    it('skips filesystem removal for a FAILED install but still deletes the row', async () => {
      const { prisma, appInstaller, provisioner } = makeDeps();
      prisma.installedApp.findUnique.mockResolvedValue({
        ...OWNED_APP,
        status: 'FAILED',
        database: null,
      });
      const service = makeService({ prisma, appInstaller, provisioner });

      await expect(service.remove('ia-1', OWNER_ID, false)).resolves.toEqual({
        success: true,
      });
      expect(appInstaller.remove).not.toHaveBeenCalled();
      expect(prisma.installedApp.delete).toHaveBeenCalledWith({
        where: { id: 'ia-1' },
      });
    });
  });
});
