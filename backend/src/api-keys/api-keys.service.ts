import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

// Lets an external system (e.g. a custom site-builder product the panel
// owner is building separately) authenticate against this panel's entire
// existing REST API with the same privileges as the owning user, without a
// login session. Mirrors the "generate once, never persist the secret
// itself" invariant used for database/mailbox passwords: only a SHA-256
// digest of the raw token is stored, so a leaked database dump can't be
// turned back into usable credentials. SHA-256 (not bcrypt) is deliberate
// here — the raw token already has 256 bits of entropy from
// crypto.randomBytes, so a slow KDF buys nothing and would needlessly slow
// down every authenticated request.
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  private generateToken(): string {
    return `pp_${crypto.randomBytes(32).toString('base64url')}`;
  }

  async generate(userId: string, dto: CreateApiKeyDto) {
    const token = this.generateToken();
    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId,
        label: dto.label,
        prefix: token.slice(0, 10),
        hashedKey: this.hash(token),
      },
      omit: { hashedKey: true },
    });
    return { ...apiKey, token };
  }

  list(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      omit: { hashedKey: true },
    });
  }

  async revoke(id: string, userId: string, isAdmin: boolean) {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey || (!isAdmin && apiKey.userId !== userId)) {
      throw new NotFoundException('API key not found');
    }
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  // Called from JwtAuthGuard when a request carries an X-API-Key header
  // instead of a Bearer JWT. Returns the same shape JwtStrategy.validate()
  // produces, so downstream code (CurrentUser, RolesGuard, ownership checks)
  // can't tell the difference between a session login and an API key.
  async authenticate(
    rawKey: string,
  ): Promise<{ userId: string; username: string; role: string } | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { hashedKey: this.hash(rawKey) },
      include: { user: true },
    });
    if (!apiKey || apiKey.revokedAt) {
      return null;
    }
    if (apiKey.user.isSuspended) {
      return null;
    }
    // Best-effort — don't let a failed audit-trail write block auth.
    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      userId: apiKey.user.id,
      username: apiKey.user.username,
      role: apiKey.user.role,
    };
  }
}
