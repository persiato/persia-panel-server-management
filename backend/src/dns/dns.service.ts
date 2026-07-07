import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DnsRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DnsRecordInput,
  isValidPriority,
  isValidRecordName,
  isValidRecordValue,
  isValidTtl,
  SystemDnsService,
} from '../system/dns/dns.service';
import { CreateDnsRecordDto } from './dto/create-dns-record.dto';
import { UpdateDnsRecordDto } from './dto/update-dns-record.dto';

const REQUIRES_PRIORITY: DnsRecord['type'][] = ['MX', 'SRV'];

@Injectable()
export class DnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemDns: SystemDnsService,
  ) {}

  private async findOwnedDomain(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
  ) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
    });
    if (!domain || (!isAdmin && domain.ownerId !== ownerId)) {
      throw new NotFoundException('Domain not found');
    }
    return domain;
  }

  private async findOwnedRecord(id: string, ownerId: string, isAdmin: boolean) {
    const record = await this.prisma.dnsRecord.findUnique({
      where: { id },
      include: { domain: true },
    });
    if (!record || (!isAdmin && record.domain.ownerId !== ownerId)) {
      throw new NotFoundException('DNS record not found');
    }
    return record;
  }

  private validate(fields: {
    type: DnsRecord['type'];
    name: string;
    value: string;
    ttl: number;
    priority?: number | null;
  }): void {
    if (!isValidRecordName(fields.name)) {
      throw new BadRequestException(`Invalid record name: ${fields.name}`);
    }
    if (!isValidRecordValue(fields.type, fields.value)) {
      throw new BadRequestException(
        `Invalid value for a ${fields.type} record: ${fields.value}`,
      );
    }
    if (!isValidTtl(fields.ttl)) {
      throw new BadRequestException(
        'TTL must be an integer between 60 and 604800 seconds',
      );
    }
    if (
      REQUIRES_PRIORITY.includes(fields.type) &&
      fields.priority != null &&
      !isValidPriority(fields.priority)
    ) {
      throw new BadRequestException(
        'Priority must be an integer between 0 and 65535',
      );
    }
  }

  async list(domainId: string, ownerId: string, isAdmin: boolean) {
    await this.findOwnedDomain(domainId, ownerId, isAdmin);
    return this.prisma.dnsRecord.findMany({
      where: { domainId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async create(ownerId: string, isAdmin: boolean, dto: CreateDnsRecordDto) {
    const domain = await this.findOwnedDomain(dto.domainId, ownerId, isAdmin);
    const ttl = dto.ttl ?? 3600;
    this.validate({
      type: dto.type,
      name: dto.name,
      value: dto.value,
      ttl,
      priority: dto.priority,
    });

    const record = await this.prisma.dnsRecord.create({
      data: {
        domainId: domain.id,
        type: dto.type,
        name: dto.name,
        value: dto.value,
        ttl,
        priority: dto.priority ?? null,
      },
    });

    await this.regenerateZone(domain.id, domain.name);
    return record;
  }

  async update(
    id: string,
    ownerId: string,
    isAdmin: boolean,
    dto: UpdateDnsRecordDto,
  ) {
    const existing = await this.findOwnedRecord(id, ownerId, isAdmin);
    const merged = {
      type: dto.type ?? existing.type,
      name: dto.name ?? existing.name,
      value: dto.value ?? existing.value,
      ttl: dto.ttl ?? existing.ttl,
      priority: dto.priority ?? existing.priority,
    };
    this.validate(merged);

    const record = await this.prisma.dnsRecord.update({
      where: { id },
      data: merged,
    });

    await this.regenerateZone(existing.domainId, existing.domain.name);
    return record;
  }

  async remove(id: string, ownerId: string, isAdmin: boolean) {
    const existing = await this.findOwnedRecord(id, ownerId, isAdmin);
    await this.prisma.dnsRecord.delete({ where: { id } });
    await this.regenerateZone(existing.domainId, existing.domain.name);
    return { success: true };
  }

  private async regenerateZone(
    domainId: string,
    domainName: string,
  ): Promise<void> {
    const records = await this.prisma.dnsRecord.findMany({
      where: { domainId },
    });
    const inputs: DnsRecordInput[] = records.map((r) => ({
      type: r.type,
      name: r.name,
      value: r.value,
      ttl: r.ttl,
      priority: r.priority,
    }));
    await this.systemDns.writeZone(domainName, inputs);
  }
}
