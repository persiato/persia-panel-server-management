import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Domain } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcmeService } from '../system/acme/acme.service';
import { NginxService } from '../system/nginx/nginx.service';

@Injectable()
export class SslService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acme: AcmeService,
    private readonly nginx: NginxService,
  ) {}

  // This module does its own ownership check rather than relying on a caller
  // having already verified it, since SslService methods aren't necessarily
  // invoked through DomainsController.
  private async findOwned(
    id: string,
    ownerId: string,
    isAdmin: boolean,
  ): Promise<Domain> {
    const domain = await this.prisma.domain.findUnique({ where: { id } });
    if (!domain || (!isAdmin && domain.ownerId !== ownerId)) {
      throw new NotFoundException('Domain not found');
    }
    return domain;
  }

  async issue(id: string, ownerId: string, isAdmin: boolean): Promise<Domain> {
    const domain = await this.findOwned(id, ownerId, isAdmin);

    const cert = await this.acme.issue(domain.name).catch((err: Error) => {
      throw new InternalServerErrorException(
        `Failed to issue SSL certificate: ${err.message}`,
      );
    });

    const updated = await this.prisma.domain.update({
      where: { id: domain.id },
      data: {
        sslEnabled: true,
        sslIssuedAt: new Date(),
        sslExpiresAt: cert.expiresAt,
      },
    });

    try {
      await this.nginx.writeVhost(updated);
    } catch (err) {
      const reverted = await this.prisma.domain.update({
        where: { id: domain.id },
        data: { sslEnabled: false, sslIssuedAt: null, sslExpiresAt: null },
      });
      await this.nginx.writeVhost(reverted).catch(() => undefined);
      throw new InternalServerErrorException(
        `Certificate issued but nginx could not be reloaded with SSL enabled: ${
          (err as Error).message
        }`,
      );
    }

    return updated;
  }

  async remove(id: string, ownerId: string, isAdmin: boolean): Promise<Domain> {
    const domain = await this.findOwned(id, ownerId, isAdmin);

    const updated = await this.prisma.domain.update({
      where: { id: domain.id },
      data: { sslEnabled: false, sslIssuedAt: null, sslExpiresAt: null },
    });

    try {
      await this.nginx.writeVhost(updated);
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to rewrite nginx config after disabling SSL: ${
          (err as Error).message
        }`,
      );
    }

    await this.acme.remove(domain.name).catch((err: Error) => {
      // The site is already back on plain HTTP at this point, so a failure
      // here (e.g. acme.sh already had no record of this domain) should not
      // fail the whole request — just surface it in the response.
      throw new InternalServerErrorException(
        `SSL disabled, but the certificate could not be fully removed: ${err.message}`,
      );
    });

    return updated;
  }
}
