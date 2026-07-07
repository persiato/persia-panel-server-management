import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

// Permissive but still constrained — this only needs to reject shell-hostile
// input; execFile/spawn never invoke a shell, so there's no injection risk,
// but a stray space/semicolon here is almost certainly a copy-paste mistake
// worth rejecting up front rather than letting `ssh` fail cryptically.
const HOSTNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{1,32}$/;
const PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

export interface SshTunnelParams {
  host: string;
  port: number;
  username: string;
  localProxyPort: number;
  privateKeyPath: string;
}

export function isValidHost(value: string): boolean {
  return net.isIP(value) !== 0 || HOSTNAME_RE.test(value);
}

export function isValidTunnelUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}

export function isValidPrivateKey(value: string): boolean {
  return PRIVATE_KEY_RE.test(value);
}

// Manages a single, server-wide SSH tunnel (a `ssh -N -D` dynamic SOCKS5
// proxy) as a systemd service. This is the "fallback connectivity" escape
// hatch for hosts behind sanctions-related connectivity issues: point it at
// a relay/bastion host outside Iran and any panel feature that shells out to
// curl can optionally route through 127.0.0.1:<localProxyPort> via
// `--socks5-hostname` when the direct route is blocked.
//
// Deliberately key-based auth only (no password option) — this is the only
// way to run a fully unattended, auto-reconnecting tunnel without ever
// persisting a plaintext secret in Postgres. The private key is written to
// its own directory on disk with restrictive permissions; only its path is
// stored in the database (see the top-level SshTunnelService).
@Injectable()
export class SystemSshTunnelService {
  private readonly logger = new Logger(SystemSshTunnelService.name);
  private readonly keyDir: string;
  private readonly systemdDir: string;
  private readonly unitName = 'pp-ssh-tunnel.service';

  constructor(private readonly config: ConfigService) {
    this.keyDir = this.config.get<string>(
      'SSH_TUNNEL_KEY_DIR',
      '/etc/persia-panel/ssh-tunnel',
    );
    this.systemdDir = this.config.get<string>(
      'SYSTEMD_UNIT_DIR',
      '/etc/systemd/system',
    );
  }

  keyFilePath(): string {
    return path.join(this.keyDir, 'id_tunnel');
  }

  knownHostsPath(): string {
    return path.join(this.keyDir, 'known_hosts');
  }

  async savePrivateKey(pem: string): Promise<string> {
    if (!isValidPrivateKey(pem)) {
      throw new Error(
        'Does not look like a private key (expected a "-----BEGIN ... PRIVATE KEY-----" block)',
      );
    }
    await fs.mkdir(this.keyDir, { recursive: true, mode: 0o700 });
    const keyPath = this.keyFilePath();
    await fs.writeFile(keyPath, pem.trim() + '\n', { mode: 0o600 });
    if (!fsSync.existsSync(this.knownHostsPath())) {
      await fs.writeFile(this.knownHostsPath(), '', { mode: 0o600 });
    }
    return keyPath;
  }

  private renderUnit(params: SshTunnelParams): string {
    const sshArgs = [
      '-N',
      '-D',
      `127.0.0.1:${params.localProxyPort}`,
      '-i',
      params.privateKeyPath,
      '-p',
      String(params.port),
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      `UserKnownHostsFile=${this.knownHostsPath()}`,
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ServerAliveInterval=30',
      '-o',
      'ServerAliveCountMax=3',
      '-o',
      'BatchMode=yes',
      `${params.username}@${params.host}`,
    ].join(' ');

    return `; Managed by Persia Panel — do not edit manually
[Unit]
Description=Persia Panel SSH tunnel fallback proxy (sanctions-resilience)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ssh ${sshArgs}
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
`;
  }

  private unitPath(): string {
    return path.join(this.systemdDir, this.unitName);
  }

  async start(params: SshTunnelParams): Promise<void> {
    if (!isValidHost(params.host)) {
      throw new Error(`Invalid tunnel host: ${params.host}`);
    }
    if (!isValidTunnelUsername(params.username)) {
      throw new Error(`Invalid tunnel username: ${params.username}`);
    }
    if (
      !Number.isInteger(params.port) ||
      params.port < 1 ||
      params.port > 65535
    ) {
      throw new Error('SSH port must be an integer between 1 and 65535');
    }
    if (
      !Number.isInteger(params.localProxyPort) ||
      params.localProxyPort < 1024 ||
      params.localProxyPort > 65535
    ) {
      throw new Error(
        'Local proxy port must be an integer between 1024 and 65535',
      );
    }

    await fs.writeFile(this.unitPath(), this.renderUnit(params), {
      mode: 0o644,
    });
    await execFileAsync('systemctl', ['daemon-reload']);
    await execFileAsync('systemctl', ['enable', '--now', this.unitName]);
  }

  async stop(): Promise<void> {
    await execFileAsync('systemctl', ['disable', '--now', this.unitName]).catch(
      (err: Error) =>
        this.logger.warn(`Could not stop ${this.unitName}: ${err.message}`),
    );
    await fs.rm(this.unitPath(), { force: true });
    await execFileAsync('systemctl', ['daemon-reload']).catch(() => undefined);
  }

  async removeKey(): Promise<void> {
    await fs.rm(this.keyFilePath(), { force: true });
  }

  async status(): Promise<{ active: boolean; enabled: boolean }> {
    const [active, enabled] = await Promise.all([
      execFileAsync('systemctl', ['is-active', this.unitName])
        .then(({ stdout }) => stdout.trim() === 'active')
        .catch(() => false),
      execFileAsync('systemctl', ['is-enabled', this.unitName])
        .then(({ stdout }) => stdout.trim() === 'enabled')
        .catch(() => false),
    ]);
    return { active, enabled };
  }

  // Proves the tunnel is actually forwarding traffic, not just that the
  // systemd unit is "active" (ssh can stay up while forwarding is broken).
  async testConnection(localProxyPort: number): Promise<string> {
    const { stdout } = await execFileAsync('curl', [
      '--socks5-hostname',
      `127.0.0.1:${localProxyPort}`,
      '-fsSL',
      '--max-time',
      '8',
      'https://api.ipify.org',
    ]);
    return stdout.trim();
  }
}
