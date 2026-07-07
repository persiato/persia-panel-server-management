import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertValidDomainName } from '../../common/validators/domain-name';

const execFileAsync = promisify(execFile);

export interface IssuedCertificate {
  keyPath: string;
  fullchainPath: string;
  expiresAt: Date;
}

// Wraps acme.sh (installed by the installer with a sanctions-safe CA fallback:
// Let's Encrypt, falling back to ZeroSSL when unreachable). Uses HTTP-01
// webroot validation against a shared, nginx-served challenge directory so it
// works regardless of the site's runtime (PHP/Node/Python/static).
@Injectable()
export class AcmeService {
  private readonly logger = new Logger(AcmeService.name);
  private readonly acmeHome: string;
  private readonly acmeBin: string;
  private readonly webroot: string;
  private readonly certDir: string;

  constructor(private readonly config: ConfigService) {
    this.acmeHome = this.config.get<string>('ACME_HOME', '/opt/acme.sh');
    this.acmeBin = path.join(this.acmeHome, 'acme.sh');
    this.webroot = this.config.get<string>(
      'ACME_WEBROOT_DIR',
      '/var/www/acme-challenge',
    );
    this.certDir = this.config.get<string>('SSL_CERT_DIR', '/etc/nginx/ssl');
  }

  private certPaths(domainName: string) {
    const dir = path.join(this.certDir, domainName);
    return {
      dir,
      key: path.join(dir, 'privkey.pem'),
      fullchain: path.join(dir, 'fullchain.pem'),
    };
  }

  // Without this, a missing acme.sh install (e.g. the installer's acme.sh
  // download failed/was skipped on a restricted network — see
  // installer/install.sh's install_ssl_tooling) surfaces as a raw Node
  // "spawn /opt/acme.sh/acme.sh ENOENT" bubbled all the way to the panel UI,
  // which gives the admin no idea what's actually wrong or how to fix it.
  private async assertAcmeInstalled(): Promise<void> {
    try {
      await fs.access(this.acmeBin, fs.constants.X_OK);
    } catch {
      throw new Error(
        `acme.sh is not installed at ${this.acmeBin}. Re-run the installer ` +
          '(sudo bash installer/install.sh) to install it, or install it ' +
          'manually: https://github.com/acmesh-official/acme.sh#1-how-to-install',
      );
    }
  }

  async issue(domainName: string): Promise<IssuedCertificate> {
    assertValidDomainName(domainName);
    await this.assertAcmeInstalled();
    await fs.mkdir(this.webroot, { recursive: true });
    const { dir, key, fullchain } = this.certPaths(domainName);
    await fs.mkdir(dir, { recursive: true });

    try {
      await execFileAsync(this.acmeBin, [
        '--home',
        this.acmeHome,
        '--issue',
        '-d',
        domainName,
        '-d',
        `www.${domainName}`,
        '--webroot',
        this.webroot,
      ]);
    } catch (err) {
      this.logger.error(
        `acme.sh --issue failed for ${domainName}: ${(err as Error).message}`,
      );
      throw err;
    }

    await execFileAsync(this.acmeBin, [
      '--home',
      this.acmeHome,
      '--install-cert',
      '-d',
      domainName,
      '--key-file',
      key,
      '--fullchain-file',
      fullchain,
      '--reloadcmd',
      'systemctl reload nginx',
    ]);

    const expiresAt = await this.readExpiry(fullchain);
    return { keyPath: key, fullchainPath: fullchain, expiresAt };
  }

  // Intended to be invoked by a system cron entry (acme.sh manages its own
  // renewal schedule internally; this just triggers its due-for-renewal check).
  async renewAll(): Promise<void> {
    await this.assertAcmeInstalled();
    await execFileAsync(this.acmeBin, [
      '--home',
      this.acmeHome,
      '--cron',
    ]).catch((err: Error) => {
      this.logger.error(`acme.sh --cron (renew-all) failed: ${err.message}`);
      throw err;
    });
  }

  async remove(domainName: string): Promise<void> {
    assertValidDomainName(domainName);
    await this.assertAcmeInstalled();
    await execFileAsync(this.acmeBin, [
      '--home',
      this.acmeHome,
      '--remove',
      '-d',
      domainName,
    ]).catch((err: Error) =>
      this.logger.warn(
        `acme.sh --remove failed for ${domainName}: ${err.message}`,
      ),
    );
    const { dir } = this.certPaths(domainName);
    await fs.rm(dir, { recursive: true, force: true });
  }

  private async readExpiry(fullchainPath: string): Promise<Date> {
    const { stdout } = await execFileAsync('openssl', [
      'x509',
      '-enddate',
      '-noout',
      '-in',
      fullchainPath,
    ]);
    // stdout looks like: "notAfter=Jan  1 00:00:00 2027 GMT"
    const match = /notAfter=(.+)/.exec(stdout);
    if (!match) {
      throw new Error(
        `Could not parse certificate expiry for ${fullchainPath}`,
      );
    }
    return new Date(match[1].trim());
  }
}
