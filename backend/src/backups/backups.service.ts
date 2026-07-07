import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from '../system/backup/backup.service';
import { CreateBackupDto } from './dto/create-backup.dto';

@Injectable()
export class BackupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backup: BackupService,
  ) {}

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
      return this.prisma.backup.create({
        data: {
          domainId: domain.id,
          fileName,
          sizeBytes,
          status: 'COMPLETE',
        },
      });
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
    }
    await this.prisma.backup.delete({ where: { id } });
    return { success: true };
  }
}
