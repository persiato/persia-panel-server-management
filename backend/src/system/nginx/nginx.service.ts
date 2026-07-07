import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Domain } from '@prisma/client';
import { assertValidDomainName } from '../../common/validators/domain-name';

const execFileAsync = promisify(execFile);

// Mirrors SUPPORTED_PHP_VERSIONS in domains/dto/create-domain.dto.ts and the
// php_versions array in installer/install.sh. domain.phpVersion is
// interpolated directly into the generated nginx vhost file (the
// fastcgi_pass socket path below) — an unvalidated value here isn't just a
// path-traversal risk, it's raw nginx-config injection, since this string is
// written straight into a config file that nginx then parses.
const SUPPORTED_PHP_VERSIONS = new Set(['7.4', '8.0', '8.1', '8.2', '8.3']);

@Injectable()
export class NginxService {
  private readonly logger = new Logger(NginxService.name);
  private readonly sitesAvailable: string;
  private readonly sitesEnabled: string;
  private readonly webroot: string;
  private readonly acmeWebroot: string;
  private readonly sslCertDir: string;

  constructor(private readonly config: ConfigService) {
    this.sitesAvailable = this.config.get<string>(
      'NGINX_SITES_AVAILABLE',
      '/etc/nginx/sites-available',
    );
    this.sitesEnabled = this.config.get<string>(
      'NGINX_SITES_ENABLED',
      '/etc/nginx/sites-enabled',
    );
    this.webroot = this.config.get<string>('PANEL_WEBROOT', '/home');
    this.acmeWebroot = this.config.get<string>(
      'ACME_WEBROOT_DIR',
      '/var/www/acme-challenge',
    );
    this.sslCertDir = this.config.get<string>('SSL_CERT_DIR', '/etc/nginx/ssl');
  }

  certPaths(domainName: string): { key: string; fullchain: string } {
    const dir = path.join(this.sslCertDir, domainName);
    return {
      key: path.join(dir, 'privkey.pem'),
      fullchain: path.join(dir, 'fullchain.pem'),
    };
  }

  private configPath(domainName: string): string {
    return path.join(this.sitesAvailable, `${domainName}.conf`);
  }

  private enabledLinkPath(domainName: string): string {
    return path.join(this.sitesEnabled, `${domainName}.conf`);
  }

  private renderServerBlock(domain: Domain): string {
    const serverName = `${domain.name} www.${domain.name}`;
    const documentRoot = domain.publicSubdir
      ? path.join(domain.documentRoot, domain.publicSubdir)
      : domain.documentRoot;

    let rootLocation: string;
    let extraLocations = '';
    switch (domain.runtime) {
      case 'PHP': {
        const version = domain.phpVersion ?? '8.3';
        if (!SUPPORTED_PHP_VERSIONS.has(version)) {
          throw new Error(`Unsupported PHP version: ${version}`);
        }
        // Falls back to index.php for any non-file path so WordPress/Laravel
        // front-controller routing (pretty permalinks, framework routes) works.
        rootLocation = `
    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php${version}-fpm-${domain.name}.sock;
    }`;
        break;
      }
      case 'NODE':
      case 'PYTHON': {
        const port = domain.appPort ?? 3000;
        rootLocation = `
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }`;
        break;
      }
      default:
        rootLocation = `
    location / {
        try_files $uri $uri/ =404;
    }`;
    }

    if (domain.runtime === 'PHP') {
      // Blocks browser access to dotfiles (.env, .git, etc.) commonly present
      // in Laravel/WordPress project roots.
      extraLocations = `
    location ~ /\\.(?!well-known).* {
        deny all;
    }`;
    }

    // Always reachable on plain HTTP (even after the redirect below) so
    // acme.sh can complete HTTP-01 validation for initial issuance/renewal.
    const acmeChallengeLocation = `
    location ^~ /.well-known/acme-challenge/ {
        root ${this.acmeWebroot};
    }`;

    const accessLog = `
    access_log /var/log/nginx/${domain.name}.access.log;
    error_log /var/log/nginx/${domain.name}.error.log;`;

    if (!domain.sslEnabled) {
      return `# Managed by Persia Panel — do not edit manually
server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};
    root ${documentRoot};
    index index.html index.htm index.php;
${acmeChallengeLocation}
${rootLocation}
${extraLocations}
${accessLog}
}
`;
    }

    const { key, fullchain } = this.certPaths(domain.name);
    return `# Managed by Persia Panel — do not edit manually
server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};
${acmeChallengeLocation}

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${serverName};
    root ${documentRoot};
    index index.html index.htm index.php;

    ssl_certificate ${fullchain};
    ssl_certificate_key ${key};
${rootLocation}
${extraLocations}
${accessLog}
}
`;
  }

  async writeVhost(domain: Domain): Promise<void> {
    assertValidDomainName(domain.name);
    const content = this.renderServerBlock(domain);
    await fs.mkdir(this.sitesAvailable, { recursive: true });
    await fs.writeFile(this.configPath(domain.name), content, { mode: 0o644 });

    await fs.mkdir(this.sitesEnabled, { recursive: true });
    const link = this.enabledLinkPath(domain.name);
    await fs.rm(link, { force: true });
    await fs.symlink(this.configPath(domain.name), link);

    await this.testAndReload();
  }

  async removeVhost(domainName: string): Promise<void> {
    assertValidDomainName(domainName);
    await fs.rm(this.enabledLinkPath(domainName), { force: true });
    await fs.rm(this.configPath(domainName), { force: true });
    await this.testAndReload();
  }

  private async testAndReload(): Promise<void> {
    try {
      await execFileAsync('nginx', ['-t']);
      await execFileAsync('systemctl', ['reload', 'nginx']);
    } catch (err) {
      this.logger.error(
        `nginx config test/reload failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
