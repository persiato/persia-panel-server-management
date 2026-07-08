import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import {
  isValidHost,
  isValidPrivateKey,
  isValidTunnelUsername,
} from '../ssh-tunnel/ssh-tunnel.service';

const execFileAsync = promisify(execFile);

export interface BackupDestinationParams {
  host: string;
  port: number;
  username: string;
  remotePath: string;
  privateKeyPath: string;
}

// Remote path written into an `rsync`/`ssh` remote spec — validated the same
// way domain/system paths are elsewhere in this codebase, just permissive
// enough for the typical "/home/backupuser/persia-panel" shapes admins use.
const REMOTE_PATH_RE = /^\/[a-zA-Z0-9._/-]{0,255}$/;

export function isValidRemotePath(value: string): boolean {
  return REMOTE_PATH_RE.test(value);
}

// Pushes completed local backup archives to an admin-configured remote host
// over SSH (rsync), as a best-effort offsite copy. Mirrors
// SystemSshTunnelService's idiom closely (same host/username validation,
// same "private key on disk, only its path in Postgres" invariant) since
// it's solving the same "reach an external host over SSH without ever
// persisting a plaintext secret" problem — this one just pushes files
// instead of holding a standing tunnel open.
@Injectable()
export class SystemBackupDestinationService {
  private readonly logger = new Logger(SystemBackupDestinationService.name);
  private readonly keyDir: string;

  constructor(private readonly config: ConfigService) {
    this.keyDir = this.config.get<string>(
      'BACKUP_DESTINATION_KEY_DIR',
      '/etc/persia-panel/backup-destination',
    );
  }

  keyFilePath(): string {
    return path.join(this.keyDir, 'id_backup');
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

  async removeKey(): Promise<void> {
    await fs.rm(this.keyFilePath(), { force: true });
  }

  private assertValidParams(params: BackupDestinationParams): void {
    if (!isValidHost(params.host)) {
      throw new Error(`Invalid backup destination host: ${params.host}`);
    }
    if (!isValidTunnelUsername(params.username)) {
      throw new Error(
        `Invalid backup destination username: ${params.username}`,
      );
    }
    if (!isValidRemotePath(params.remotePath)) {
      throw new Error(
        `Invalid backup destination remote path: ${params.remotePath}`,
      );
    }
    if (
      !Number.isInteger(params.port) ||
      params.port < 1 ||
      params.port > 65535
    ) {
      throw new Error('SSH port must be an integer between 1 and 65535');
    }
  }

  private sshOptions(params: BackupDestinationParams): string[] {
    return [
      '-i',
      params.privateKeyPath,
      '-p',
      String(params.port),
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      `UserKnownHostsFile=${this.knownHostsPath()}`,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
    ];
  }

  // Verifies the destination is actually reachable and writable before the
  // admin saves it — the same "prove it, don't just accept the form" idiom
  // as SystemSshTunnelService.testConnection, applied to a plain SSH command
  // instead of the SOCKS5 proxy (there's no standing tunnel here to test).
  async testConnection(params: BackupDestinationParams): Promise<void> {
    this.assertValidParams(params);
    await fs.mkdir(this.keyDir, { recursive: true, mode: 0o700 });
    if (!fsSync.existsSync(this.knownHostsPath())) {
      await fs.writeFile(this.knownHostsPath(), '', { mode: 0o600 });
    }
    await execFileAsync('ssh', [
      ...this.sshOptions(params),
      `${params.username}@${params.host}`,
      'mkdir',
      '-p',
      params.remotePath,
    ]);
  }

  // Pushes one local file to `<remotePath>/<domainName>/<fileName>` on the
  // destination. Best-effort by design (see Backup.offsiteSyncedAt/offsiteError
  // in schema.prisma) — callers must not let a failure here roll back or fail
  // the local backup it's copying.
  async push(
    params: BackupDestinationParams,
    domainName: string,
    localFilePath: string,
    fileName: string,
  ): Promise<void> {
    this.assertValidParams(params);
    const remoteDir = `${params.remotePath.replace(/\/+$/, '')}/${domainName}`;
    await execFileAsync('ssh', [
      ...this.sshOptions(params),
      `${params.username}@${params.host}`,
      'mkdir',
      '-p',
      remoteDir,
    ]);
    await execFileAsync('rsync', [
      '-a',
      '-e',
      `ssh ${this.sshOptions(params).join(' ')}`,
      localFilePath,
      `${params.username}@${params.host}:${remoteDir}/${fileName}`,
    ]);
  }

  async remove(
    params: BackupDestinationParams,
    domainName: string,
    fileName: string,
  ): Promise<void> {
    this.assertValidParams(params);
    const remotePath = `${params.remotePath.replace(/\/+$/, '')}/${domainName}/${fileName}`;
    await execFileAsync('ssh', [
      ...this.sshOptions(params),
      `${params.username}@${params.host}`,
      'rm',
      '-f',
      remotePath,
    ]).catch((err: Error) =>
      this.logger.warn(
        `Could not remove offsite copy of ${fileName} for ${domainName}: ${err.message}`,
      ),
    );
  }
}
