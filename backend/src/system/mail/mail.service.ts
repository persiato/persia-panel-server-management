import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertValidDomainName } from '../../common/validators/domain-name';

const execFileAsync = promisify(execFile);

// Local part of a mailbox address: letters/digits/dot/underscore/plus/hyphen,
// 1-64 chars, must start and end on an alphanumeric character.
const LOCAL_PART_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._+-]{0,62}[a-zA-Z0-9])?$/;

export function isValidLocalPart(value: string): boolean {
  return LOCAL_PART_RE.test(value);
}

// Manages Postfix's virtual-mailbox maps (delivery/routing) and Dovecot's
// flat-file credential store (auth) as the mail backend for domains hosted
// on this panel — the "cPanel email accounts" feature. Mirrors
// DbProvisionerService's shape (generate a random password, shell out to
// provision a real system resource) but with one deliberate difference: the
// password is never stored in our own Postgres database at all, not even
// hashed — Dovecot's own `vmail_passwd` file on disk IS the credential
// store, exactly like SshTunnelConfig's private key file. Postfix maps
// require `postmap` after every edit to rebuild their on-disk hash db;
// Dovecot's passwd-file driver reads the plain file directly, no compile
// step needed.
@Injectable()
export class SystemMailService {
  private readonly logger = new Logger(SystemMailService.name);
  private readonly domainsFile: string;
  private readonly mailboxFile: string;
  private readonly dovecotPasswdFile: string;
  private readonly storageDir: string;
  private readonly vmailUid: string;
  private readonly vmailGid: string;

  constructor(private readonly config: ConfigService) {
    this.domainsFile = this.config.get<string>(
      'POSTFIX_VIRTUAL_DOMAINS_FILE',
      '/etc/postfix/vmail_domains',
    );
    this.mailboxFile = this.config.get<string>(
      'POSTFIX_VIRTUAL_MAILBOX_FILE',
      '/etc/postfix/vmail_mailbox',
    );
    this.dovecotPasswdFile = this.config.get<string>(
      'DOVECOT_PASSWD_FILE',
      '/etc/dovecot/vmail_passwd',
    );
    this.storageDir = this.config.get<string>(
      'MAIL_STORAGE_DIR',
      '/var/mail/vhosts',
    );
    this.vmailUid = this.config.get<string>('VMAIL_UID', '5000');
    this.vmailGid = this.config.get<string>('VMAIL_GID', '5000');
  }

  generatePassword(): string {
    return crypto.randomBytes(18).toString('base64url');
  }

  private mailboxKey(domainName: string, localPart: string): string {
    return `${localPart}@${domainName}`;
  }

  private maildirRelPath(domainName: string, localPart: string): string {
    return `${domainName}/${localPart}/`;
  }

  private maildirAbsPath(domainName: string, localPart: string): string {
    return path.join(this.storageDir, domainName, localPart);
  }

  // Extracts the "key" a map line is indexed by — everything up to the
  // first whitespace (Postfix maps: `key value`) or colon (Dovecot passwd
  // file: `key:hash:...`).
  private lineKey(line: string): string {
    const match = /^([^\s:]+)/.exec(line);
    return match ? match[1] : '';
  }

  private async readLines(filePath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.split('\n').filter((l) => l.trim().length > 0);
    } catch {
      return [];
    }
  }

  private async writeMapFile(filePath: string, lines: string[]): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, lines.length ? lines.join('\n') + '\n' : '', {
      mode: 0o640,
    });
  }

  private async upsertLine(
    filePath: string,
    key: string,
    line: string,
  ): Promise<void> {
    const lines = await this.readLines(filePath);
    const filtered = lines.filter((l) => this.lineKey(l) !== key);
    filtered.push(line);
    await this.writeMapFile(filePath, filtered);
  }

  private async removeLine(filePath: string, key: string): Promise<void> {
    const lines = await this.readLines(filePath);
    const filtered = lines.filter((l) => this.lineKey(l) !== key);
    await this.writeMapFile(filePath, filtered);
  }

  private async removeLinesForDomain(
    filePath: string,
    domainName: string,
  ): Promise<void> {
    const lines = await this.readLines(filePath);
    const filtered = lines.filter(
      (l) => !this.lineKey(l).endsWith(`@${domainName}`),
    );
    await this.writeMapFile(filePath, filtered);
  }

  private async postmap(filePath: string): Promise<void> {
    await execFileAsync('postmap', [`hash:${filePath}`]);
  }

  private async reloadPostfix(): Promise<void> {
    await execFileAsync('systemctl', ['reload', 'postfix']);
  }

  private async reloadDovecot(): Promise<void> {
    await execFileAsync('systemctl', ['reload', 'dovecot']);
  }

  private async hashPassword(password: string): Promise<string> {
    // Output already includes the `{SCHEME}` prefix Dovecot expects
    // (e.g. `{SHA512-CRYPT}$6$...`), so it can be written to the passwd
    // file verbatim.
    const { stdout } = await execFileAsync('doveadm', [
      'pw',
      '-s',
      'SHA512-CRYPT',
      '-p',
      password,
    ]);
    return stdout.trim();
  }

  async ensureDomainRegistered(domainName: string): Promise<void> {
    assertValidDomainName(domainName);
    await this.upsertLine(this.domainsFile, domainName, `${domainName} OK`);
    await this.postmap(this.domainsFile);
  }

  async createMailbox(
    domainName: string,
    localPart: string,
    password: string,
  ): Promise<void> {
    assertValidDomainName(domainName);
    if (!isValidLocalPart(localPart)) {
      throw new Error(`Invalid mailbox local part: ${localPart}`);
    }

    await this.ensureDomainRegistered(domainName);

    const key = this.mailboxKey(domainName, localPart);
    await this.upsertLine(
      this.mailboxFile,
      key,
      `${key} ${this.maildirRelPath(domainName, localPart)}`,
    );
    await this.postmap(this.mailboxFile);

    const hash = await this.hashPassword(password);
    await this.upsertLine(this.dovecotPasswdFile, key, `${key}:${hash}::::::`);

    const maildir = this.maildirAbsPath(domainName, localPart);
    await fs.mkdir(path.join(maildir, 'cur'), { recursive: true });
    await fs.mkdir(path.join(maildir, 'new'), { recursive: true });
    await fs.mkdir(path.join(maildir, 'tmp'), { recursive: true });
    await execFileAsync('chown', [
      '-R',
      `${this.vmailUid}:${this.vmailGid}`,
      path.join(this.storageDir, domainName),
    ]);

    await this.reloadPostfix();
    await this.reloadDovecot();
  }

  async resetPassword(
    domainName: string,
    localPart: string,
    password: string,
  ): Promise<void> {
    assertValidDomainName(domainName);
    if (!isValidLocalPart(localPart)) {
      throw new Error(`Invalid mailbox local part: ${localPart}`);
    }
    const key = this.mailboxKey(domainName, localPart);
    const hash = await this.hashPassword(password);
    await this.upsertLine(this.dovecotPasswdFile, key, `${key}:${hash}::::::`);
    await this.reloadDovecot();
  }

  async removeMailbox(
    domainName: string,
    localPart: string,
    deleteFiles = true,
  ): Promise<void> {
    assertValidDomainName(domainName);
    const key = this.mailboxKey(domainName, localPart);
    await this.removeLine(this.mailboxFile, key);
    await this.postmap(this.mailboxFile).catch(() => undefined);
    await this.removeLine(this.dovecotPasswdFile, key);

    if (deleteFiles) {
      await fs.rm(this.maildirAbsPath(domainName, localPart), {
        recursive: true,
        force: true,
      });
    }

    await this.reloadPostfix().catch((err: Error) =>
      this.logger.warn(`Could not reload postfix: ${err.message}`),
    );
    await this.reloadDovecot().catch((err: Error) =>
      this.logger.warn(`Could not reload dovecot: ${err.message}`),
    );
  }

  async removeDomain(domainName: string): Promise<void> {
    assertValidDomainName(domainName);
    await this.removeLine(this.domainsFile, domainName);
    await this.postmap(this.domainsFile).catch(() => undefined);
    await this.removeLinesForDomain(this.mailboxFile, domainName);
    await this.postmap(this.mailboxFile).catch(() => undefined);
    await this.removeLinesForDomain(this.dovecotPasswdFile, domainName);
    await fs
      .rm(path.join(this.storageDir, domainName), {
        recursive: true,
        force: true,
      })
      .catch(() => undefined);

    await this.reloadPostfix().catch((err: Error) =>
      this.logger.warn(`Could not reload postfix: ${err.message}`),
    );
    await this.reloadDovecot().catch((err: Error) =>
      this.logger.warn(`Could not reload dovecot: ${err.message}`),
    );
  }
}
