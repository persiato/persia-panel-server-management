import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { isValidLocalPart, SystemMailService } from './mail.service';

interface SystemMailServiceInternal {
  upsertLine(filePath: string, key: string, line: string): Promise<void>;
  removeLine(filePath: string, key: string): Promise<void>;
  readLines(filePath: string): Promise<string[]>;
}

function internal(service: SystemMailService): SystemMailServiceInternal {
  return service as unknown as SystemMailServiceInternal;
}

function makeService(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    POSTFIX_VIRTUAL_DOMAINS_FILE: '/etc/postfix/vmail_domains',
    POSTFIX_VIRTUAL_MAILBOX_FILE: '/etc/postfix/vmail_mailbox',
    DOVECOT_PASSWD_FILE: '/etc/dovecot/vmail_passwd',
    MAIL_STORAGE_DIR: '/var/mail/vhosts',
    VMAIL_UID: '5000',
    VMAIL_GID: '5000',
    ...overrides,
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
  return new SystemMailService(config as unknown as ConfigService);
}

describe('isValidLocalPart', () => {
  it('accepts typical mailbox local parts', () => {
    expect(isValidLocalPart('info')).toBe(true);
    expect(isValidLocalPart('john.doe')).toBe(true);
    expect(isValidLocalPart('sales+tag')).toBe(true);
    expect(isValidLocalPart('a1')).toBe(true);
  });

  it('rejects empty, overlong, or malformed local parts', () => {
    expect(isValidLocalPart('')).toBe(false);
    expect(isValidLocalPart('a'.repeat(65))).toBe(false);
    expect(isValidLocalPart('.leading')).toBe(false);
    expect(isValidLocalPart('trailing.')).toBe(false);
    expect(isValidLocalPart('has space')).toBe(false);
    expect(isValidLocalPart('has;semicolon')).toBe(false);
  });
});

describe('generatePassword', () => {
  it('generates a reasonably long, unique random password', () => {
    const service = makeService();
    const a = service.generatePassword();
    const b = service.generatePassword();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });
});

describe('SystemMailService line-map helpers (private)', () => {
  let tmpDir: string;
  let mapFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-mail-test-'));
    mapFile = path.join(tmpDir, 'vmail_mailbox');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates the map file on first upsert and can read it back', async () => {
    const service = makeService();
    await internal(service).upsertLine(
      mapFile,
      'info@example.com',
      'info@example.com example.com/info/',
    );
    const lines = await internal(service).readLines(mapFile);
    expect(lines).toEqual(['info@example.com example.com/info/']);
  });

  it('replaces the existing line for a key rather than duplicating it', async () => {
    const service = makeService();
    await internal(service).upsertLine(
      mapFile,
      'info@example.com',
      'info@example.com example.com/info/',
    );
    await internal(service).upsertLine(
      mapFile,
      'info@example.com',
      'info@example.com example.com/info-renamed/',
    );
    const lines = await internal(service).readLines(mapFile);
    expect(lines).toEqual(['info@example.com example.com/info-renamed/']);
  });

  it('leaves other keys untouched when removing one', async () => {
    const service = makeService();
    await internal(service).upsertLine(
      mapFile,
      'info@example.com',
      'info@example.com example.com/info/',
    );
    await internal(service).upsertLine(
      mapFile,
      'sales@example.com',
      'sales@example.com example.com/sales/',
    );
    await internal(service).removeLine(mapFile, 'info@example.com');
    const lines = await internal(service).readLines(mapFile);
    expect(lines).toEqual(['sales@example.com example.com/sales/']);
  });

  it('returns an empty array for a file that does not exist yet', async () => {
    const service = makeService();
    const lines = await internal(service).readLines(
      path.join(tmpDir, 'does-not-exist'),
    );
    expect(lines).toEqual([]);
  });
});

describe('SystemMailService.createMailbox validation', () => {
  it('rejects an invalid domain name before touching disk or shelling out', async () => {
    const service = makeService();
    await expect(
      service.createMailbox('not a domain', 'info', 'pw'),
    ).rejects.toThrow('Invalid domain name');
  });

  it('rejects an invalid local part before touching disk or shelling out', async () => {
    const service = makeService();
    await expect(
      service.createMailbox('example.com', 'bad local part', 'pw'),
    ).rejects.toThrow('Invalid mailbox local part');
  });
});

describe('SystemMailService.createMailbox end-to-end (postmap/doveadm not installed)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-mail-e2e-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('registers the domain map line before eventually failing on a missing mail-stack binary', async () => {
    const domainsFile = path.join(tmpDir, 'vmail_domains');
    const mailboxFile = path.join(tmpDir, 'vmail_mailbox');
    const passwdFile = path.join(tmpDir, 'vmail_passwd');
    const storageDir = path.join(tmpDir, 'vhosts');
    const service = makeService({
      POSTFIX_VIRTUAL_DOMAINS_FILE: domainsFile,
      POSTFIX_VIRTUAL_MAILBOX_FILE: mailboxFile,
      DOVECOT_PASSWD_FILE: passwdFile,
      MAIL_STORAGE_DIR: storageDir,
    });

    // This dev sandbox is never a fully provisioned mail server, so this
    // chain of postmap/doveadm/chown/systemctl shell-outs must fail
    // *somewhere* — but exactly where depends on which of those binaries
    // happen to be present locally (e.g. macOS ships a real `postmap`).
    // What must hold regardless of environment is that the domains map
    // write (the very first side effect) always happens before any shell
    // command runs.
    await expect(
      service.createMailbox('example.com', 'info', 'a-password'),
    ).rejects.toThrow(/ENOENT|not found/i);

    const domainsContent = await fs.readFile(domainsFile, 'utf8');
    expect(domainsContent).toContain('example.com OK');
  });
});
