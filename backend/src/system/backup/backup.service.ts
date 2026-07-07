import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Database, Domain } from '@prisma/client';
import { assertValidDomainName } from '../../common/validators/domain-name';
import { assertValidSqlIdentifier } from '../../common/validators/sql-identifier';

const execFileAsync = promisify(execFile);

// Backup archive file names are generated server-side and also accepted back
// from API callers (download/restore/delete) as a path segment, so they must
// be strictly validated to rule out path traversal.
const BACKUP_FILE_NAME_RE = /^[a-zA-Z0-9_-]{1,80}\.tar\.gz$/;

export interface CreatedBackup {
  fileName: string;
  sizeBytes: number;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;

  constructor(private readonly config: ConfigService) {
    this.backupDir = this.config.get<string>(
      'BACKUP_DIR',
      '/var/backups/persia-panel',
    );
  }

  private domainDir(domainName: string): string {
    assertValidDomainName(domainName);
    return path.join(this.backupDir, domainName);
  }

  private assertValidFileName(fileName: string): void {
    if (!BACKUP_FILE_NAME_RE.test(fileName)) {
      throw new Error(`Invalid backup file name: ${fileName}`);
    }
  }

  filePath(domainName: string, fileName: string): string {
    this.assertValidFileName(fileName);
    return path.join(this.domainDir(domainName), fileName);
  }

  private generateFileName(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = crypto.randomBytes(3).toString('hex');
    return `backup-${stamp}-${random}.tar.gz`;
  }

  // Runs `command` with stdout redirected to `outFile` — the equivalent of
  // `command > outFile` without ever going through a shell.
  private runToFile(
    command: string,
    args: string[],
    outFile: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fd = fsSync.openSync(outFile, 'w');
      const child = spawn(command, args, { stdio: ['ignore', fd, 'ignore'] });
      child.on('error', (err) => {
        fsSync.closeSync(fd);
        reject(err);
      });
      child.on('close', (code) => {
        fsSync.closeSync(fd);
        if (code === 0) resolve();
        else reject(new Error(`${command} exited with code ${code}`));
      });
    });
  }

  // Runs `command` with stdin fed from `inFile` — the equivalent of
  // `command < inFile` without ever going through a shell.
  private runFromFile(
    command: string,
    args: string[],
    inFile: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fd = fsSync.openSync(inFile, 'r');
      const child = spawn(command, args, { stdio: [fd, 'ignore', 'ignore'] });
      child.on('error', (err) => {
        fsSync.closeSync(fd);
        reject(err);
      });
      child.on('close', (code) => {
        fsSync.closeSync(fd);
        if (code === 0) resolve();
        else reject(new Error(`${command} exited with code ${code}`));
      });
    });
  }

  private dumpFileName(db: Database): string {
    assertValidSqlIdentifier(db.name);
    return `${db.name}.${db.engine.toLowerCase()}.sql`;
  }

  private async dumpDatabase(db: Database, destDir: string): Promise<void> {
    assertValidSqlIdentifier(db.name);
    const outFile = path.join(destDir, this.dumpFileName(db));
    if (db.engine === 'MYSQL') {
      // Root connects via the auth_socket/unix_socket plugin, same as
      // DbProvisionerService — no password needed.
      await this.runToFile('mysqldump', ['-u', 'root', db.name], outFile);
    } else {
      await this.runToFile(
        'runuser',
        ['-u', 'postgres', '--', 'pg_dump', db.name],
        outFile,
      );
    }
  }

  private async restoreDatabase(db: Database, srcDir: string): Promise<void> {
    assertValidSqlIdentifier(db.name);
    const inFile = path.join(srcDir, this.dumpFileName(db));
    if (!fsSync.existsSync(inFile)) {
      this.logger.warn(
        `No dump found for database ${db.name} in backup, skipping restore for it`,
      );
      return;
    }
    if (db.engine === 'MYSQL') {
      await this.runFromFile('mysql', ['-u', 'root', db.name], inFile);
    } else {
      await this.runFromFile(
        'runuser',
        ['-u', 'postgres', '--', 'psql', '-v', 'ON_ERROR_STOP=1', db.name],
        inFile,
      );
    }
  }

  async create(domain: Domain, databases: Database[]): Promise<CreatedBackup> {
    const domainDir = this.domainDir(domain.name);
    await fs.mkdir(domainDir, { recursive: true });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-backup-'));
    try {
      const filesDir = path.join(tmpDir, 'files');
      await fs.mkdir(filesDir, { recursive: true });
      await execFileAsync('cp', ['-a', `${domain.documentRoot}/.`, filesDir]);

      if (databases.length > 0) {
        const dbDir = path.join(tmpDir, 'databases');
        await fs.mkdir(dbDir, { recursive: true });
        for (const db of databases) {
          await this.dumpDatabase(db, dbDir);
        }
      }

      const fileName = this.generateFileName();
      const tarPath = path.join(domainDir, fileName);
      await execFileAsync('tar', ['-czf', tarPath, '-C', tmpDir, '.']);

      const stat = await fs.stat(tarPath);
      return { fileName, sizeBytes: stat.size };
    } finally {
      await fs
        .rm(tmpDir, { recursive: true, force: true })
        .catch(() =>
          this.logger.warn(`Could not clean up temp backup dir ${tmpDir}`),
        );
    }
  }

  async restore(
    domain: Domain,
    databases: Database[],
    fileName: string,
  ): Promise<void> {
    const tarPath = this.filePath(domain.name, fileName);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-restore-'));
    try {
      await execFileAsync('tar', ['-xzf', tarPath, '-C', tmpDir]);

      const filesDir = path.join(tmpDir, 'files');
      if (fsSync.existsSync(filesDir)) {
        await fs.mkdir(domain.documentRoot, { recursive: true });
        await execFileAsync('cp', ['-a', `${filesDir}/.`, domain.documentRoot]);
      }

      const dbDir = path.join(tmpDir, 'databases');
      if (databases.length > 0 && fsSync.existsSync(dbDir)) {
        for (const db of databases) {
          await this.restoreDatabase(db, dbDir);
        }
      }
    } finally {
      await fs
        .rm(tmpDir, { recursive: true, force: true })
        .catch(() =>
          this.logger.warn(`Could not clean up temp restore dir ${tmpDir}`),
        );
    }
  }

  async remove(domainName: string, fileName: string): Promise<void> {
    const filePath = this.filePath(domainName, fileName);
    await fs.rm(filePath, { force: true });
  }
}
