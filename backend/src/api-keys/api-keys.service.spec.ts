import { NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';

function makeDeps() {
  const prisma = {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
  return { prisma };
}

type Deps = ReturnType<typeof makeDeps>;

function makeService(deps: Deps): ApiKeysService {
  return new ApiKeysService(deps.prisma as unknown as PrismaService);
}

interface CreateArgs {
  data: {
    label: string;
    prefix: string;
    userId: string;
    hashedKey: string;
  };
  omit?: Record<string, boolean>;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

describe('ApiKeysService', () => {
  describe('generate', () => {
    it('stores only a SHA-256 hash of the token, never the raw value, and returns the raw token exactly once', async () => {
      const { prisma } = makeDeps();
      let seenArgs: CreateArgs | undefined;
      prisma.apiKey.create.mockImplementation((args: CreateArgs) => {
        seenArgs = args;
        return Promise.resolve({
          id: 'key-1',
          label: args.data.label,
          prefix: args.data.prefix,
          userId: args.data.userId,
          createdAt: new Date(),
        });
      });
      const service = makeService({ prisma });

      const result = await service.generate(USER_ID, { label: 'Site Builder' });

      expect(result.token).toMatch(/^pp_/);
      expect(result.prefix).toBe(result.token.slice(0, 10));
      expect((result as Record<string, unknown>).hashedKey).toBeUndefined();

      expect(seenArgs?.omit).toEqual({ hashedKey: true });
      expect(seenArgs?.data.hashedKey).toBe(sha256(result.token));
      expect(seenArgs?.data.hashedKey).not.toBe(result.token);
    });

    it('generates a different token/hash on every call', async () => {
      const { prisma } = makeDeps();
      prisma.apiKey.create.mockImplementation(({ data }: CreateArgs) =>
        Promise.resolve({ id: 'key', ...data }),
      );
      const service = makeService({ prisma });

      const a = await service.generate(USER_ID, { label: 'a' });
      const b = await service.generate(USER_ID, { label: 'b' });
      expect(a.token).not.toBe(b.token);
    });
  });

  describe('revoke', () => {
    it('throws NotFoundException for a key belonging to another user (non-admin)', async () => {
      const { prisma } = makeDeps();
      prisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        userId: OTHER_USER_ID,
      });
      const service = makeService({ prisma });

      await expect(service.revoke('key-1', USER_ID, false)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('allows an admin to revoke any key', async () => {
      const { prisma } = makeDeps();
      prisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        userId: OTHER_USER_ID,
      });
      const service = makeService({ prisma });

      await expect(service.revoke('key-1', USER_ID, true)).resolves.toEqual({
        success: true,
      });
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('authenticate', () => {
    it('returns null for an unknown token', async () => {
      const { prisma } = makeDeps();
      prisma.apiKey.findUnique.mockResolvedValue(null);
      const service = makeService({ prisma });

      await expect(service.authenticate('pp_bogus')).resolves.toBeNull();
    });

    it('returns null for a revoked key', async () => {
      const { prisma } = makeDeps();
      prisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        revokedAt: new Date(),
        user: {
          id: USER_ID,
          username: 'alice',
          role: 'USER',
          isSuspended: false,
        },
      });
      const service = makeService({ prisma });

      await expect(service.authenticate('pp_token')).resolves.toBeNull();
    });

    it('returns null for a suspended user', async () => {
      const { prisma } = makeDeps();
      prisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        revokedAt: null,
        user: {
          id: USER_ID,
          username: 'alice',
          role: 'USER',
          isSuspended: true,
        },
      });
      const service = makeService({ prisma });

      await expect(service.authenticate('pp_token')).resolves.toBeNull();
    });

    it('returns the owning user shape and hashes the raw key for the lookup', async () => {
      const { prisma } = makeDeps();
      prisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        revokedAt: null,
        user: {
          id: USER_ID,
          username: 'alice',
          role: 'ADMIN',
          isSuspended: false,
        },
      });
      const service = makeService({ prisma });

      const result = await service.authenticate('pp_raw-token');
      expect(result).toEqual({
        userId: USER_ID,
        username: 'alice',
        role: 'ADMIN',
      });
      expect(prisma.apiKey.findUnique).toHaveBeenCalledWith({
        where: { hashedKey: sha256('pp_raw-token') },
        include: { user: true },
      });
    });
  });
});
