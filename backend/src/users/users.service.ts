import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { RuntimeService } from '../system/runtime/runtime.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  private readonly webroot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: RuntimeService,
    private readonly config: ConfigService,
  ) {
    this.webroot = this.config.get<string>('PANEL_WEBROOT', '/home');
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('Email or username already in use');
    }
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        role: dto.role,
        diskQuotaMb: dto.diskQuotaMb,
      },
    });

    // Domains, cron jobs, and app installs all end up shelling out as this
    // user's Linux username (php-fpm pool `user =`, `crontab -u`, systemd
    // `User=`). Provision the matching OS account right away instead of
    // waiting for the first domain to be created — otherwise a user who
    // creates a cron job before ever adding a domain hits an opaque
    // "user unknown" failure from `crontab -u`.
    try {
      const homeDir = path.join(this.webroot, dto.username);
      await this.runtime.ensureSystemUser(dto.username, homeDir);
    } catch (err) {
      await this.prisma.user
        .delete({ where: { id: user.id } })
        .catch(() => undefined);
      throw new InternalServerErrorException(
        `Failed to provision system account: ${(err as Error).message}`,
      );
    }

    return this.sanitize(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.sanitize(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return this.sanitize(user);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  private sanitize(user: { passwordHash: string; [key: string]: unknown }) {
    const rest: Record<string, unknown> = { ...user };
    delete rest.passwordHash;
    return rest;
  }
}
