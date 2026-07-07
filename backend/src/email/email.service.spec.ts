import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemMailService } from '../system/mail/mail.service';
import { EmailService } from './email.service';

function makeDeps() {
  const prisma = {
    domain: { findUnique: jest.fn() },
    emailAccount: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  const systemMail = {
    generatePassword: jest.fn().mockReturnValue('generated-password'),
    createMailbox: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
    removeMailbox: jest.fn().mockResolvedValue(undefined),
  };
  return { prisma, systemMail };
}

type Deps = ReturnType<typeof makeDeps>;

function makeService(deps: Deps): EmailService {
  return new EmailService(
    deps.prisma as unknown as PrismaService,
    deps.systemMail as unknown as SystemMailService,
  );
}

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';
const DOMAIN = { id: 'domain-1', name: 'example.com', ownerId: OWNER_ID };

describe('EmailService', () => {
  describe('list', () => {
    it('throws NotFoundException for a domain owned by someone else (non-admin)', async () => {
      const { prisma, systemMail } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      const service = makeService({ prisma, systemMail });

      await expect(
        service.list(DOMAIN.id, OTHER_OWNER_ID, false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('rejects an invalid local part before generating any password', async () => {
      const { prisma, systemMail } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      const service = makeService({ prisma, systemMail });

      await expect(
        service.create(OWNER_ID, false, {
          domainId: DOMAIN.id,
          localPart: 'bad local part',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(systemMail.generatePassword).not.toHaveBeenCalled();
    });

    it('rejects a duplicate mailbox for the same domain', async () => {
      const { prisma, systemMail } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.emailAccount.findUnique.mockResolvedValue({ id: 'existing' });
      const service = makeService({ prisma, systemMail });

      await expect(
        service.create(OWNER_ID, false, {
          domainId: DOMAIN.id,
          localPart: 'info',
        }),
      ).rejects.toThrow(ConflictException);
      expect(systemMail.createMailbox).not.toHaveBeenCalled();
    });

    it('provisions the mailbox and returns the generated password exactly once', async () => {
      const { prisma, systemMail } = makeDeps();
      prisma.domain.findUnique.mockResolvedValue(DOMAIN);
      prisma.emailAccount.findUnique.mockResolvedValue(null);
      prisma.emailAccount.create.mockResolvedValue({
        id: 'acct-1',
        domainId: DOMAIN.id,
        localPart: 'info',
        quotaMb: 1024,
      });
      const service = makeService({ prisma, systemMail });

      const result = await service.create(OWNER_ID, false, {
        domainId: DOMAIN.id,
        localPart: 'info',
      });

      expect(systemMail.createMailbox).toHaveBeenCalledWith(
        'example.com',
        'info',
        'generated-password',
      );
      expect(result).toEqual({
        id: 'acct-1',
        domainId: DOMAIN.id,
        localPart: 'info',
        quotaMb: 1024,
        password: 'generated-password',
      });
    });
  });

  describe('resetPassword', () => {
    it('throws NotFoundException for a mailbox belonging to another owner', async () => {
      const { prisma, systemMail } = makeDeps();
      prisma.emailAccount.findUnique.mockResolvedValue({
        id: 'acct-1',
        localPart: 'info',
        domain: DOMAIN,
      });
      const service = makeService({ prisma, systemMail });

      await expect(
        service.resetPassword('acct-1', OTHER_OWNER_ID, false),
      ).rejects.toThrow(NotFoundException);
      expect(systemMail.resetPassword).not.toHaveBeenCalled();
    });

    it('generates and applies a new password', async () => {
      const { prisma, systemMail } = makeDeps();
      prisma.emailAccount.findUnique.mockResolvedValue({
        id: 'acct-1',
        localPart: 'info',
        domain: DOMAIN,
      });
      const service = makeService({ prisma, systemMail });

      const result = await service.resetPassword('acct-1', OWNER_ID, false);
      expect(systemMail.resetPassword).toHaveBeenCalledWith(
        'example.com',
        'info',
        'generated-password',
      );
      expect(result).toEqual({ password: 'generated-password' });
    });
  });

  describe('remove', () => {
    it('removes the system mailbox and deletes the row', async () => {
      const { prisma, systemMail } = makeDeps();
      prisma.emailAccount.findUnique.mockResolvedValue({
        id: 'acct-1',
        localPart: 'info',
        domain: DOMAIN,
      });
      const service = makeService({ prisma, systemMail });

      const result = await service.remove('acct-1', OWNER_ID, false);
      expect(systemMail.removeMailbox).toHaveBeenCalledWith(
        'example.com',
        'info',
      );
      expect(prisma.emailAccount.delete).toHaveBeenCalledWith({
        where: { id: 'acct-1' },
      });
      expect(result).toEqual({ success: true });
    });
  });
});
