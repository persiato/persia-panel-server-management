import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { BackupDestinationConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isValidHost,
  isValidTunnelUsername,
} from '../system/ssh-tunnel/ssh-tunnel.service';
import {
  isValidRemotePath,
  SystemBackupDestinationService,
} from '../system/backup-destination/backup-destination.service';
import { SaveBackupDestinationDto } from './dto/save-backup-destination.dto';

@Injectable()
export class BackupDestinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemDestination: SystemBackupDestinationService,
  ) {}

  private getRow(): Promise<BackupDestinationConfig | null> {
    return this.prisma.backupDestinationConfig.findFirst();
  }

  private sanitize(row: BackupDestinationConfig) {
    const { privateKeyPath, ...rest } = row;
    return { ...rest, hasPrivateKey: !!privateKeyPath };
  }

  async getStatus() {
    const row = await this.getRow();
    if (!row) {
      return { configured: false, enabled: false, hasPrivateKey: false };
    }
    return { configured: true, ...this.sanitize(row) };
  }

  async save(dto: SaveBackupDestinationDto) {
    const existing = await this.getRow();
    if (!dto.privateKey && !existing?.privateKeyPath) {
      throw new BadRequestException(
        'A private key is required to configure a backup destination',
      );
    }
    if (!isValidHost(dto.host)) {
      throw new BadRequestException(`Invalid backup destination host: ${dto.host}`);
    }
    if (!isValidTunnelUsername(dto.username)) {
      throw new BadRequestException(
        `Invalid backup destination username: ${dto.username}`,
      );
    }
    if (!isValidRemotePath(dto.remotePath)) {
      throw new BadRequestException(
        `Invalid backup destination remote path: ${dto.remotePath}`,
      );
    }

    let privateKeyPath = existing?.privateKeyPath ?? null;
    if (dto.privateKey) {
      try {
        privateKeyPath = await this.systemDestination.savePrivateKey(
          dto.privateKey,
        );
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
    }

    const data = {
      host: dto.host,
      port: dto.port ?? 22,
      username: dto.username,
      remotePath: dto.remotePath,
      privateKeyPath,
      enabled: dto.enabled ?? true,
    };

    try {
      await this.systemDestination.testConnection({
        host: data.host,
        port: data.port,
        username: data.username,
        remotePath: data.remotePath,
        privateKeyPath: privateKeyPath as string,
      });
    } catch (err) {
      const message = (err as Error).message;
      await this.upsert(existing, { ...data, lastError: message });
      throw new InternalServerErrorException(
        `Could not reach the backup destination: ${message}`,
      );
    }

    const row = await this.upsert(existing, { ...data, lastError: null });
    return this.sanitize(row);
  }

  private upsert(
    existing: BackupDestinationConfig | null,
    data: Omit<
      BackupDestinationConfig,
      'id' | 'updatedAt' | 'lastSyncedAt'
    >,
  ): Promise<BackupDestinationConfig> {
    if (existing) {
      return this.prisma.backupDestinationConfig.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.backupDestinationConfig.create({ data });
  }

  async remove() {
    const existing = await this.getRow();
    if (!existing) {
      throw new NotFoundException('No backup destination is configured');
    }
    await this.systemDestination.removeKey();
    await this.prisma.backupDestinationConfig.delete({
      where: { id: existing.id },
    });
    return { success: true };
  }

  async testConnection() {
    const row = await this.getRow();
    if (!row) {
      throw new NotFoundException('No backup destination is configured');
    }
    try {
      await this.systemDestination.testConnection({
        host: row.host,
        port: row.port,
        username: row.username,
        remotePath: row.remotePath,
        privateKeyPath: row.privateKeyPath as string,
      });
      return { success: true };
    } catch (err) {
      throw new InternalServerErrorException(
        `Backup destination test failed: ${(err as Error).message}`,
      );
    }
  }
}
