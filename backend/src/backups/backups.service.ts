import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BackupDestinationConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from '../system/backup/backup.service';
import { SystemBackupDestinationService } from '../system/backup-destination/backup-destination.service';
import { CreateBackupDto } from './dto/create-backup.dto';

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly backup: BackupService,
    private readonly destination: SystemBackupDestinationService,
  ) {}

  // Best-effort: an offsite destination is optional infrastructure, so a
  // failed/absent push must never fail the backup request that already
  // succeeded locally (same posture as DomainsService's DNS auto-seed).
  private async pushOffsite(
    backupId: string,
    domainName: string,
    fileName: string,
  ): Promise<void> {
    const config: BackupDestinationConfig | null =
      await this.prisma.backupDestinationConfig.findFirst();
    if (!config || !config.enabled) return;

    const localPath = this.backup.filePath(domainName, fileName);
    try {
      await this.destination.push(
        {
          host: config.host,
          port: config.port,
          username: config.username,
          remotePath: config.remotePath,
          privateKeyPath: config.privateKeyPath as string,
        },
        domainName,
        localPath,
        fileName,
      );
      await this.prisma.backup.update({
        where: { id: backupId },
        data: { offsiteSyncedAt: new Date(), offsiteError: null },
      });
      await this.prisma.backupDestinationConfig.update({
        where: { id: config.id },
        data: { lastSyncedAt: new Date(), lastError: null },
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(
        `Offsite push failed for ${domainName}/${fileName}: ${message}`,
      );
      await this.prisma.backup
        .update({ where: { id: backupId }, data: { offsiteError: message } })
        .catch(() => undefined);
      await this.prisma.backupDestinationConfig
        .update({ where: { id: config.id }, data: { lastError: message } })
        .catch(() => undefined);
    }
  }

  async create(ownerId: string, isAdmin: boolean, dto: CreateBackupDto) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: dto.domainId },
    });
    if (!domain || (!isAdmin && domain.ownerId !== ownerId)) {
      throw new NotFoundException('Domain not found');
    }
    const databases = await this.prisma.database.findMany({
      where: { domainId: domain.id },
    });

    try {
      const { fileName, sizeBytes } = await this.backup.create(
        domain,
        databases,
      );
      const created = await this.prisma.backup.create({
        data: {
          domainId: domain.id,
          fileName,
          sizeBytes,
          status: 'COMPLETE',
        },
      });
      await this.pushOffsite(created.id, domain.name, fileName);
      return created;
    } catch (err) {
      await this.prisma.backup
        .create({
          data: {
            domainId: domain.id,
            fileName: '',
            sizeBytes: 0,
            status: 'FAILED',
            error: (err as Error).message,
          },
        })
        .catch(() => undefined);
      throw new InternalServerErrorException(
        `Failed to create backup: ${(err as Error).message}`,
      );
    }
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.backup.findMany({
      where: { domain: { ownerId } },
      include: { domain: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll() {
    return this.prisma.backup.findMany({
      include: { domain: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findOwned(id: string, ownerId: string, isAdmin: boolean) {
    const backup = await this.prisma.backup.findUnique({
      where: { id },
      include: { domain: true },
    });
    if (!backup || (!isAdmin && backup.domain.ownerId !== ownerId)) {
      throw new NotFoundException('Backup not found');
    }
    return backup;
  }

  async getDownloadPath(id: string, ownerId: string, isAdmin: boolean) {
    const backup = await this.findOwned(id, ownerId, isAdmin);
    if (backup.status !== 'COMPLETE') {
      throw new NotFoundException('Backup file not available');
    }
    return {
      path: this.backup.filePath(backup.domain.name, backup.fileName),
      fileName: backup.fileName,
    };
  }

  async restore(id: string, ownerId: string, isAdmin: boolean) {
    const backup = await this.findOwned(id, ownerId, isAdmin);
    if (backup.status !== 'COMPLETE') {
      throw new NotFoundException('Backup file not available');
    }
    const databases = await this.prisma.database.findMany({
      where: { domainId: backup.domainId },
    });
    try {
      await this.backup.restore(backup.domain, databases, backup.fileName);
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to restore backup: ${(err as Error).message}`,
      );
    }
    return { success: true };
  }

  async remove(id: string, ownerId: string, isAdmin: boolean) {
    const backup = await this.findOwned(id, ownerId, isAdmin);
    if (backup.status === 'COMPLETE') {
      await this.backup
        .remove(backup.domain.name, backup.fileName)
        .catch(() => undefined);
      if (backup.offsiteSyncedAt) {
        const config = await this.prisma.backupDestinationConfig.findFirst();
        if (config) {
          await this.destination
            .remove(
              {
                host: config.host,
                port: config.port,
                username: config.username,
                remotePath: config.remotePath,
                privateKeyPath: config.privateKeyPath as string,
              },
              backup.domain.name,
              backup.fileName,
            )
            .catch(() => undefined);
        }
      }
    }
    await this.prisma.backup.delete({ where: { id } });
    return { success: true };
  }
}
