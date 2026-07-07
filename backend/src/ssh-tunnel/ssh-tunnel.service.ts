import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SshTunnelConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isValidHost,
  isValidTunnelUsername,
  SystemSshTunnelService,
} from '../system/ssh-tunnel/ssh-tunnel.service';
import { SaveSshTunnelConfigDto } from './dto/save-ssh-tunnel-config.dto';

@Injectable()
export class SshTunnelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemTunnel: SystemSshTunnelService,
  ) {}

  private getRow(): Promise<SshTunnelConfig | null> {
    return this.prisma.sshTunnelConfig.findFirst();
  }

  private sanitize(row: SshTunnelConfig) {
    const { privateKeyPath, ...rest } = row;
    return { ...rest, hasPrivateKey: !!privateKeyPath };
  }

  async getStatus() {
    const row = await this.getRow();
    if (!row) {
      return {
        configured: false,
        active: false,
        enabled: false,
        hasPrivateKey: false,
      };
    }
    const live = await this.systemTunnel.status();
    return { configured: true, ...this.sanitize(row), ...live };
  }

  async save(dto: SaveSshTunnelConfigDto) {
    const existing = await this.getRow();
    if (!dto.privateKey && !existing?.privateKeyPath) {
      throw new BadRequestException(
        'A private key is required to configure the tunnel',
      );
    }
    if (!isValidHost(dto.host)) {
      throw new BadRequestException(`Invalid tunnel host: ${dto.host}`);
    }
    if (!isValidTunnelUsername(dto.username)) {
      throw new BadRequestException(`Invalid tunnel username: ${dto.username}`);
    }

    let privateKeyPath = existing?.privateKeyPath ?? null;
    if (dto.privateKey) {
      try {
        privateKeyPath = await this.systemTunnel.savePrivateKey(dto.privateKey);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
    }

    const data = {
      host: dto.host,
      port: dto.port ?? 22,
      username: dto.username,
      localProxyPort: dto.localProxyPort ?? 1080,
      privateKeyPath,
      enabled: dto.enabled ?? true,
    };

    let row: SshTunnelConfig;
    try {
      if (data.enabled) {
        await this.systemTunnel.start({
          host: data.host,
          port: data.port,
          username: data.username,
          localProxyPort: data.localProxyPort,
          privateKeyPath: privateKeyPath as string,
        });
      } else {
        await this.systemTunnel.stop();
      }
      row = await this.upsert(existing, { ...data, lastError: null });
    } catch (err) {
      const message = (err as Error).message;
      row = await this.upsert(existing, { ...data, lastError: message });
      throw new InternalServerErrorException(
        `Failed to start SSH tunnel: ${message}`,
      );
    }

    return this.sanitize(row);
  }

  private upsert(
    existing: SshTunnelConfig | null,
    data: Omit<SshTunnelConfig, 'id' | 'updatedAt'>,
  ): Promise<SshTunnelConfig> {
    if (existing) {
      return this.prisma.sshTunnelConfig.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.sshTunnelConfig.create({ data });
  }

  async remove() {
    const existing = await this.getRow();
    if (!existing) {
      throw new NotFoundException('No SSH tunnel is configured');
    }
    await this.systemTunnel.stop();
    await this.systemTunnel.removeKey();
    await this.prisma.sshTunnelConfig.delete({ where: { id: existing.id } });
    return { success: true };
  }

  async testConnection() {
    const row = await this.getRow();
    if (!row) {
      throw new NotFoundException('No SSH tunnel is configured');
    }
    try {
      const publicIp = await this.systemTunnel.testConnection(
        row.localProxyPort,
      );
      return { success: true, publicIp };
    } catch (err) {
      throw new InternalServerErrorException(
        `Tunnel test failed: ${(err as Error).message}`,
      );
    }
  }
}
