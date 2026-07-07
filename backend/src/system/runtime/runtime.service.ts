import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Domain, User } from '@prisma/client';
import { assertValidDomainName } from '../../common/validators/domain-name';

const execFileAsync = promisify(execFile);
const LINUX_USERNAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;

// Mirrors SUPPORTED_PHP_VERSIONS in domains/dto/create-domain.dto.ts and the
// php_versions array in installer/install.sh. phpVersion is interpolated
// into this.phpPoolDir (e.g. `/etc/php/{version}/fpm/pool.d`) and into a
// socket path/systemctl unit name below, so it must be checked here too —
// the DTO validates create requests, but domain.phpVersion could also arrive
// via a stored/legacy row, and removePhpPool takes a raw parameter.
const SUPPORTED_PHP_VERSIONS = new Set(['7.4', '8.0', '8.1', '8.2', '8.3']);

@Injectable()
export class RuntimeService {
  private readonly logger = new Logger(RuntimeService.name);
  private readonly phpPoolDir: string;
  private readonly systemdDir: string;

  constructor(private readonly config: ConfigService) {
    this.phpPoolDir = this.config.get<string>(
      'PHP_FPM_POOL_DIR_TEMPLATE',
      '/etc/php/{version}/fpm/pool.d',
    );
    this.systemdDir = this.config.get<string>(
      'SYSTEMD_UNIT_DIR',
      '/etc/systemd/system',
    );
  }

  private assertSystemUser(username: string): void {
    if (!LINUX_USERNAME_RE.test(username)) {
      throw new Error(`Invalid system username: ${username}`);
    }
  }

  private assertSupportedPhpVersion(version: string): void {
    if (!SUPPORTED_PHP_VERSIONS.has(version)) {
      throw new Error(`Unsupported PHP version: ${version}`);
    }
  }

  // PHP-FPM pools and app systemd units run as the domain owner's Linux
  // account (`owner.username`), but that account is just a row in our own
  // User table — nothing else in the codebase ever provisions a matching OS
  // user. Without this, php-fpm fails to start the pool (and the whole
  // php-fpm master can die with it) the first time a domain is owned by a
  // username with no corresponding `/etc/passwd` entry. Call this before
  // writing any pool/unit file that references `owner.username`.
  async ensureSystemUser(username: string, homeDir: string): Promise<void> {
    this.assertSystemUser(username);
    try {
      await execFileAsync('id', ['-u', username]);
      return; // already exists
    } catch {
      // fall through and create it
    }
    await execFileAsync('useradd', [
      '--home-dir',
      homeDir,
      '--no-create-home',
      '--shell',
      '/usr/sbin/nologin',
      username,
    ]);
  }

  async createOrUpdatePhpPool(domain: Domain, owner: User): Promise<void> {
    assertValidDomainName(domain.name);
    this.assertSystemUser(owner.username);
    const version = domain.phpVersion ?? '8.3';
    this.assertSupportedPhpVersion(version);
    const poolDir = this.phpPoolDir.replace('{version}', version);
    const poolFile = path.join(poolDir, `${domain.name}.conf`);

    const content = `; Managed by Persia Panel — do not edit manually
[${domain.name}]
user = ${owner.username}
group = ${owner.username}
listen = /run/php/php${version}-fpm-${domain.name}.sock
listen.owner = www-data
listen.group = www-data
pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
chdir = ${domain.documentRoot}
`;
    await fs.mkdir(poolDir, { recursive: true });
    await fs.writeFile(poolFile, content, { mode: 0o644 });
    await execFileAsync('systemctl', ['reload', `php${version}-fpm`]);
  }

  async removePhpPool(domainName: string, phpVersion = '8.3'): Promise<void> {
    assertValidDomainName(domainName);
    this.assertSupportedPhpVersion(phpVersion);
    const poolDir = this.phpPoolDir.replace('{version}', phpVersion);
    await fs.rm(path.join(poolDir, `${domainName}.conf`), { force: true });
    await execFileAsync('systemctl', ['reload', `php${phpVersion}-fpm`]).catch(
      (err) =>
        this.logger.warn(
          `Could not reload php${phpVersion}-fpm: ${(err as Error).message}`,
        ),
    );
  }

  private unitName(domainName: string): string {
    return `pp-app-${domainName}.service`;
  }

  async createOrUpdateAppService(domain: Domain, owner: User): Promise<void> {
    assertValidDomainName(domain.name);
    this.assertSystemUser(owner.username);
    if (domain.runtime !== 'NODE' && domain.runtime !== 'PYTHON') return;
    if (!domain.appEntryPoint || !domain.appPort) {
      throw new Error(
        'appEntryPoint and appPort are required for NODE/PYTHON runtimes',
      );
    }

    const execStart =
      domain.runtime === 'NODE'
        ? `/usr/bin/node ${domain.appEntryPoint}`
        : `/usr/bin/python3 ${domain.appEntryPoint}`;

    const unit = `; Managed by Persia Panel — do not edit manually
[Unit]
Description=Persia Panel app for ${domain.name}
After=network.target

[Service]
Type=simple
User=${owner.username}
Group=${owner.username}
WorkingDirectory=${domain.documentRoot}
Environment=PORT=${domain.appPort}
ExecStart=${execStart}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
    const unitPath = path.join(this.systemdDir, this.unitName(domain.name));
    await fs.writeFile(unitPath, unit, { mode: 0o644 });
    await execFileAsync('systemctl', ['daemon-reload']);
    await execFileAsync('systemctl', [
      'enable',
      '--now',
      this.unitName(domain.name),
    ]);
  }

  async removeAppService(domainName: string): Promise<void> {
    assertValidDomainName(domainName);
    const name = this.unitName(domainName);
    await execFileAsync('systemctl', ['disable', '--now', name]).catch(
      () => undefined,
    );
    await fs.rm(path.join(this.systemdDir, name), { force: true });
    await execFileAsync('systemctl', ['daemon-reload']).catch(() => undefined);
  }
}
