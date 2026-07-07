import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { DatabaseEngine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppDefinition,
  AppInstallerService,
  DbCredentials,
} from '../system/app-installer/app-installer.service';
import { DbProvisionerService } from '../system/db-provisioner/db-provisioner.service';
import { isValidRelativePath } from '../common/validators/relative-path';
import { InstallAppDto } from './dto/install-app.dto';

@Injectable()
export class AppsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appInstaller: AppInstallerService,
    private readonly provisioner: DbProvisionerService,
  ) {}

  listCatalog() {
    return this.appInstaller.listCatalog();
  }

  async install(ownerId: string, isAdmin: boolean, dto: InstallAppDto) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: dto.domainId },
    });
    if (!domain || (!isAdmin && domain.ownerId !== ownerId)) {
      throw new NotFoundException('Domain not found');
    }

    let def: AppDefinition;
    try {
      def = this.appInstaller.getDefinition(dto.appId);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const targetPath = dto.targetPath ?? '';
    if (!isValidRelativePath(targetPath)) {
      throw new BadRequestException(`Invalid install path: ${targetPath}`);
    }
    const targetDir = path.join(domain.documentRoot, targetPath);

    const existingInstall = await this.prisma.installedApp.findFirst({
      where: { domainId: domain.id, targetPath, status: { not: 'FAILED' } },
    });
    if (existingInstall) {
      throw new ConflictException('An app is already installed at this path');
    }
    if (
      fsSync.existsSync(targetDir) &&
      (await fs.readdir(targetDir)).length > 0
    ) {
      throw new ConflictException(
        'Target directory is not empty — choose a different install path',
      );
    }

    let database: { id: string; name: string; username: string } | undefined;
    try {
      let dbCredentials: DbCredentials | undefined;
      if (def.requiresDatabase) {
        const owner = await this.prisma.user.findUniqueOrThrow({
          where: { id: domain.ownerId },
        });
        const suffix = crypto.randomBytes(3).toString('hex');
        const identifier = `${owner.username}_${def.id}_${suffix}`
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .slice(0, 32);
        const password = this.provisioner.generatePassword();
        await this.provisioner.createMysqlDatabase(
          identifier,
          identifier,
          password,
        );
        database = await this.prisma.database.create({
          data: {
            name: identifier,
            engine: DatabaseEngine.MYSQL,
            username: identifier,
            domainId: domain.id,
          },
        });
        dbCredentials = {
          host: 'localhost',
          name: identifier,
          user: identifier,
          password,
        };
      }

      const { version } = await this.appInstaller.install(
        dto.appId,
        targetDir,
        dbCredentials,
      );

      return this.prisma.installedApp.create({
        data: {
          appId: def.id,
          version,
          targetPath,
          status: 'COMPLETE',
          domainId: domain.id,
          databaseId: database?.id,
        },
      });
    } catch (err) {
      if (database) {
        await this.provisioner
          .dropMysqlDatabase(database.name, database.username)
          .catch(() => undefined);
        await this.prisma.database
          .delete({ where: { id: database.id } })
          .catch(() => undefined);
      }
      await this.prisma.installedApp
        .create({
          data: {
            appId: dto.appId,
            version: def.version,
            targetPath,
            status: 'FAILED',
            error: (err as Error).message,
            domainId: domain.id,
          },
        })
        .catch(() => undefined);
      throw new InternalServerErrorException(
        `Failed to install ${def.name}: ${(err as Error).message}`,
      );
    }
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.installedApp.findMany({
      where: { domain: { ownerId } },
      include: { domain: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll() {
    return this.prisma.installedApp.findMany({
      include: { domain: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findOwned(id: string, ownerId: string, isAdmin: boolean) {
    const app = await this.prisma.installedApp.findUnique({
      where: { id },
      include: { domain: true, database: true },
    });
    if (!app || (!isAdmin && app.domain.ownerId !== ownerId)) {
      throw new NotFoundException('Installed app not found');
    }
    return app;
  }

  async remove(id: string, ownerId: string, isAdmin: boolean) {
    const app = await this.findOwned(id, ownerId, isAdmin);

    if (app.status === 'COMPLETE') {
      const targetDir = path.join(app.domain.documentRoot, app.targetPath);
      await this.appInstaller.remove(targetDir).catch(() => undefined);
    }

    if (app.database) {
      if (app.database.engine === DatabaseEngine.MYSQL) {
        await this.provisioner
          .dropMysqlDatabase(app.database.name, app.database.username)
          .catch(() => undefined);
      } else {
        await this.provisioner
          .dropPostgresDatabase(app.database.name, app.database.username)
          .catch(() => undefined);
      }
      await this.prisma.database
        .delete({ where: { id: app.database.id } })
        .catch(() => undefined);
    }

    await this.prisma.installedApp.delete({ where: { id } });
    return { success: true };
  }
}
