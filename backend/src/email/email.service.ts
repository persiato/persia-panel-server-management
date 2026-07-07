import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  isValidLocalPart,
  SystemMailService,
} from '../system/mail/mail.service';
import { CreateEmailAccountDto } from './dto/create-email-account.dto';

@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemMail: SystemMailService,
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

  private async findOwnedAccount(
    id: string,
    ownerId: string,
    isAdmin: boolean,
  ) {
    const account = await this.prisma.emailAccount.findUnique({
      where: { id },
      include: { domain: true },
    });
    if (!account || (!isAdmin && account.domain.ownerId !== ownerId)) {
      throw new NotFoundException('Email account not found');
    }
    return account;
  }

  async list(domainId: string, ownerId: string, isAdmin: boolean) {
    await this.findOwnedDomain(domainId, ownerId, isAdmin);
    return this.prisma.emailAccount.findMany({
      where: { domainId },
      orderBy: { localPart: 'asc' },
    });
  }

  async create(ownerId: string, isAdmin: boolean, dto: CreateEmailAccountDto) {
    const domain = await this.findOwnedDomain(dto.domainId, ownerId, isAdmin);
    if (!isValidLocalPart(dto.localPart)) {
      throw new BadRequestException(
        `Invalid mailbox local part: ${dto.localPart}`,
      );
    }

    const existing = await this.prisma.emailAccount.findUnique({
      where: {
        domainId_localPart: {
          domainId: domain.id,
          localPart: dto.localPart,
        },
      },
    });
    if (existing) {
      throw new ConflictException('This mailbox already exists');
    }

    const password = this.systemMail.generatePassword();
    await this.systemMail.createMailbox(domain.name, dto.localPart, password);

    const account = await this.prisma.emailAccount.create({
      data: {
        domainId: domain.id,
        localPart: dto.localPart,
        quotaMb: dto.quotaMb ?? 1024,
      },
    });

    return { ...account, password };
  }

  async resetPassword(id: string, ownerId: string, isAdmin: boolean) {
    const account = await this.findOwnedAccount(id, ownerId, isAdmin);
    const password = this.systemMail.generatePassword();
    await this.systemMail.resetPassword(
      account.domain.name,
      account.localPart,
      password,
    );
    return { password };
  }

  async remove(id: string, ownerId: string, isAdmin: boolean) {
    const account = await this.findOwnedAccount(id, ownerId, isAdmin);
    await this.systemMail.removeMailbox(account.domain.name, account.localPart);
    await this.prisma.emailAccount.delete({ where: { id } });
    return { success: true };
  }
}
