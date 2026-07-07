import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { NginxService } from '../system/nginx/nginx.service';
import { RuntimeService } from '../system/runtime/runtime.service';
import { SystemDnsService } from '../system/dns/dns.service';
import { SystemMailService } from '../system/mail/mail.service';
import { DnsService } from '../dns/dns.service';
import { DnsRecordType } from '@prisma/client';
import { CreateDomainDto } from './dto/create-domain.dto';

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);
  private readonly webroot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nginx: NginxService,
    private readonly runtime: RuntimeService,
    private readonly config: ConfigService,
    private readonly dnsService: DnsService,
    private readonly systemDns: SystemDnsService,
    private readonly systemMail: SystemMailService,
  ) {
    this.webroot = this.config.get<string>('PANEL_WEBROOT', '/home');
  }

  async create(ownerId: string, dto: CreateDomainDto) {
    const existing = await this.prisma.domain.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Domain already exists');
    }
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    const documentRoot = path.join(
      this.webroot,
      owner.username,
      'public_html',
      dto.name,
    );
    await fs.mkdir(documentRoot, { recursive: true });

    const domain = await this.prisma.domain.create({
      data: {
        name: dto.name,
        documentRoot,
        runtime: dto.runtime,
        phpVersion: dto.phpVersion,
        nodeVersion: dto.nodeVersion,
        pythonVersion: dto.pythonVersion,
        appEntryPoint: dto.appEntryPoint,
        appPort: dto.appPort,
        publicSubdir: dto.publicSubdir,
        ownerId,
      },
    });

    try {
      if (domain.runtime === 'PHP') {
        await this.runtime.createOrUpdatePhpPool(domain, owner);
      } else if (domain.runtime === 'NODE' || domain.runtime === 'PYTHON') {
        await this.runtime.createOrUpdateAppService(domain, owner);
      }
      await this.nginx.writeVhost(domain);
    } catch (err) {
      await this.prisma.domain
        .delete({ where: { id: domain.id } })
        .catch(() => undefined);
      throw new InternalServerErrorException(
        `Failed to provision the website: ${(err as Error).message}`,
      );
    }

    // Best-effort: DNS is optional infrastructure (bind9 may not even be
    // installed on this deployment), so a failure here must never roll back
    // the website that was just successfully provisioned. Only seed records
    // when the operator has told us what IP to point them at — otherwise
    // there's nothing meaningful to write, and the DNS page remains fully
    // usable for manual record management regardless.
    const publicIp = this.config.get<string>('SERVER_PUBLIC_IP');
    if (publicIp) {
      try {
        await this.dnsService.create(ownerId, true, {
          domainId: domain.id,
          type: DnsRecordType.A,
          name: '@',
          value: publicIp,
        });
        await this.dnsService.create(ownerId, true, {
          domainId: domain.id,
          type: DnsRecordType.A,
          name: 'www',
          value: publicIp,
        });
      } catch (err) {
        this.logger.warn(
          `Could not auto-seed DNS records for ${domain.name}: ${(err as Error).message}`,
        );
      }
    }

    return domain;
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.domain.findMany({ where: { ownerId } });
  }

  findAll() {
    return this.prisma.domain.findMany();
  }

  async findOne(id: string) {
    const domain = await this.prisma.domain.findUnique({ where: { id } });
    if (!domain) throw new NotFoundException('Domain not found');
    return domain;
  }

  // NOTE: RESELLER is intentionally treated as a non-admin owner here, scoped
  // to domains it owns, mirroring CronService.findOwned(). Confirm with
  // product whether resellers should be able to manage domains owned by
  // their sub-users/clients before loosening this check.
  async findOwned(id: string, ownerId: string, isAdmin: boolean) {
    const domain = await this.prisma.domain.findUnique({ where: { id } });
    if (!domain || (!isAdmin && domain.ownerId !== ownerId)) {
      throw new NotFoundException('Domain not found');
    }
    return domain;
  }

  async remove(id: string, ownerId: string, isAdmin: boolean) {
    const domain = await this.findOwned(id, ownerId, isAdmin);
    await this.nginx.removeVhost(domain.name);
    if (domain.runtime === 'PHP') {
      await this.runtime.removePhpPool(
        domain.name,
        domain.phpVersion ?? undefined,
      );
    } else if (domain.runtime === 'NODE' || domain.runtime === 'PYTHON') {
      await this.runtime.removeAppService(domain.name);
    }

    // Best-effort, same reasoning as the auto-seed above: DNS/mail
    // infrastructure may not be configured on this deployment at all, so a
    // missing bind9/postfix install must never block domain deletion.
    await this.systemDns
      .removeZone(domain.name)
      .catch((err: Error) =>
        this.logger.warn(
          `Could not remove DNS zone for ${domain.name}: ${err.message}`,
        ),
      );
    await this.systemMail
      .removeDomain(domain.name)
      .catch((err: Error) =>
        this.logger.warn(
          `Could not remove mail domain for ${domain.name}: ${err.message}`,
        ),
      );

    await this.prisma.domain.delete({ where: { id } });
    return { success: true };
  }
}
