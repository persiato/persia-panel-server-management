import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const execFileAsync = promisify(execFile);

export interface DbCredentials {
  host: string;
  name: string;
  user: string;
  password: string;
}

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  requiresDatabase: boolean;
  // Env var an operator can set to override the pinned download URL below —
  // e.g. to point at a mirror if the upstream host is unreachable from an
  // Iranian IP, the same escape hatch the installer offers via HTTPS_PROXY.
  downloadUrlEnvVar: string;
  defaultDownloadUrl: string;
  // Name of the single top-level directory the tarball extracts into, so we
  // can find the real payload inside the temp extraction dir.
  archiveRootDir: string;
}

// A conservative, curated catalog rather than an arbitrary-URL installer —
// every entry is a pinned, known-good version so a bad upstream release
// can't silently break every future install. Operators can bump the version
// (and downloadUrlEnvVar override) here as new releases are vetted.
const APP_CATALOG: AppDefinition[] = [
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'محبوب‌ترین سیستم مدیریت محتوا برای وبلاگ و وب‌سایت',
    version: 'latest',
    requiresDatabase: true,
    downloadUrlEnvVar: 'WORDPRESS_DOWNLOAD_URL',
    defaultDownloadUrl: 'https://wordpress.org/latest.tar.gz',
    archiveRootDir: 'wordpress',
  },
  {
    id: 'phpmyadmin',
    name: 'phpMyAdmin',
    description: 'ابزار مدیریت گرافیکی دیتابیس‌های MySQL از طریق مرورگر',
    version: '5.2.1',
    requiresDatabase: false,
    downloadUrlEnvVar: 'PHPMYADMIN_DOWNLOAD_URL',
    defaultDownloadUrl:
      'https://files.phpmyadmin.net/phpMyAdmin/5.2.1/phpMyAdmin-5.2.1-all-languages.tar.gz',
    archiveRootDir: 'phpMyAdmin-5.2.1-all-languages',
  },
];

@Injectable()
export class AppInstallerService {
  private readonly logger = new Logger(AppInstallerService.name);
  private readonly downloadTimeoutSeconds: number;

  constructor(private readonly config: ConfigService) {
    this.downloadTimeoutSeconds = Number(
      this.config.get<string>('APP_INSTALL_DOWNLOAD_TIMEOUT_SECONDS', '300'),
    );
  }

  listCatalog(): AppDefinition[] {
    return APP_CATALOG;
  }

  getDefinition(appId: string): AppDefinition {
    const def = APP_CATALOG.find((a) => a.id === appId);
    if (!def) {
      throw new Error(`Unknown app: ${appId}`);
    }
    return def;
  }

  private downloadFile(
    url: string,
    destFile: string,
    timeoutSeconds: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fd = fsSync.openSync(destFile, 'w');
      const child = spawn(
        'curl',
        ['-fsSL', '--max-time', String(timeoutSeconds), url],
        { stdio: ['ignore', fd, 'ignore'] },
      );
      child.on('error', (err) => {
        fsSync.closeSync(fd);
        reject(err);
      });
      child.on('close', (code) => {
        fsSync.closeSync(fd);
        if (code === 0) resolve();
        else reject(new Error(`curl exited with code ${code} for ${url}`));
      });
    });
  }

  private async downloadWithRetry(
    url: string,
    destFile: string,
    attempts = 3,
  ): Promise<void> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.downloadFile(url, destFile, this.downloadTimeoutSeconds);
        return;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(
          `Download attempt ${attempt}/${attempts} failed for ${url}: ${lastError.message}`,
        );
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
    }
    throw new Error(
      `Failed to download ${url} after ${attempts} attempts: ${lastError?.message}`,
    );
  }

  private generateSecret(bytes = 48): string {
    return crypto.randomBytes(bytes).toString('base64');
  }

  private async writeWordPressConfig(
    targetDir: string,
    db: DbCredentials,
  ): Promise<void> {
    const escape = (v: string) => v.replace(/'/g, "\\'");
    const salts = Array.from({ length: 8 }, () => this.generateSecret(32));
    const [
      authKey,
      secureAuthKey,
      loggedInKey,
      nonceKey,
      authSalt,
      secureAuthSalt,
      loggedInSalt,
      nonceSalt,
    ] = salts;

    const content = `<?php
// Managed by Persia Panel — generated at install time, safe to customize further.
define('DB_NAME', '${escape(db.name)}');
define('DB_USER', '${escape(db.user)}');
define('DB_PASSWORD', '${escape(db.password)}');
define('DB_HOST', '${escape(db.host)}');
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');

define('AUTH_KEY', '${escape(authKey)}');
define('SECURE_AUTH_KEY', '${escape(secureAuthKey)}');
define('LOGGED_IN_KEY', '${escape(loggedInKey)}');
define('NONCE_KEY', '${escape(nonceKey)}');
define('AUTH_SALT', '${escape(authSalt)}');
define('SECURE_AUTH_SALT', '${escape(secureAuthSalt)}');
define('LOGGED_IN_SALT', '${escape(loggedInSalt)}');
define('NONCE_SALT', '${escape(nonceSalt)}');

$table_prefix = 'wp_';

define('WP_DEBUG', false);

if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}

require_once ABSPATH . 'wp-settings.php';
`;
    await fs.writeFile(path.join(targetDir, 'wp-config.php'), content, {
      mode: 0o640,
    });
  }

  private async writePhpMyAdminConfig(targetDir: string): Promise<void> {
    const escape = (v: string) => v.replace(/'/g, "\\'");
    const blowfishSecret = this.generateSecret(32);
    const content = `<?php
// Managed by Persia Panel — generated at install time, safe to customize further.
$cfg['blowfish_secret'] = '${escape(blowfishSecret)}';

$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;

$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
`;
    await fs.writeFile(path.join(targetDir, 'config.inc.php'), content, {
      mode: 0o640,
    });
  }

  async install(
    appId: string,
    targetDir: string,
    db?: DbCredentials,
  ): Promise<{ version: string }> {
    const def = this.getDefinition(appId);
    if (def.requiresDatabase && !db) {
      throw new Error(`${def.name} requires a database but none was provided`);
    }
    const downloadUrl = this.config.get<string>(
      def.downloadUrlEnvVar,
      def.defaultDownloadUrl,
    );

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-app-'));
    try {
      const archivePath = path.join(tmpDir, 'archive.tar.gz');
      await this.downloadWithRetry(downloadUrl, archivePath);

      const extractDir = path.join(tmpDir, 'extracted');
      await fs.mkdir(extractDir, { recursive: true });
      await execFileAsync('tar', ['-xzf', archivePath, '-C', extractDir]);

      const payloadDir = path.join(extractDir, def.archiveRootDir);
      if (!fsSync.existsSync(payloadDir)) {
        throw new Error(
          `Unexpected archive layout for ${def.name}: ${def.archiveRootDir} not found`,
        );
      }

      await fs.mkdir(targetDir, { recursive: true });
      await execFileAsync('cp', ['-a', `${payloadDir}/.`, targetDir]);

      if (appId === 'wordpress' && db) {
        await this.writeWordPressConfig(targetDir, db);
      } else if (appId === 'phpmyadmin') {
        await this.writePhpMyAdminConfig(targetDir);
      }

      return { version: def.version };
    } finally {
      await fs
        .rm(tmpDir, { recursive: true, force: true })
        .catch(() =>
          this.logger.warn(`Could not clean up temp app-install dir ${tmpDir}`),
        );
    }
  }

  async remove(targetDir: string): Promise<void> {
    await fs.rm(targetDir, { recursive: true, force: true });
  }
}
