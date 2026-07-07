import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as crypto from 'node:crypto';
import { assertValidSqlIdentifier } from '../../common/validators/sql-identifier';

const execFileAsync = promisify(execFile);

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

@Injectable()
export class DbProvisionerService {
  private readonly logger = new Logger(DbProvisionerService.name);

  generatePassword(): string {
    return crypto.randomBytes(18).toString('base64url');
  }

  private async runMysql(sql: string): Promise<void> {
    // Connects as the local `root` account via the auth_socket/unix_socket
    // plugin — the default on Debian/Ubuntu MariaDB/MySQL installs — which
    // maps the OS root user to DB root with no password required.
    await execFileAsync('mysql', ['-u', 'root', '-e', sql]);
  }

  private async runPsql(sql: string): Promise<void> {
    // Postgres defaults local peer auth for the `postgres` role to the OS
    // `postgres` user. We run as root, so switch user via runuser.
    await execFileAsync('runuser', [
      '-u',
      'postgres',
      '--',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ]);
  }

  async createMysqlDatabase(
    dbName: string,
    dbUser: string,
    password: string,
  ): Promise<void> {
    assertValidSqlIdentifier(dbName);
    assertValidSqlIdentifier(dbUser);
    const sql = [
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      `CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${escapeSqlLiteral(password)}';`,
      `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost';`,
      `FLUSH PRIVILEGES;`,
    ].join(' ');
    await this.runMysql(sql);
  }

  async dropMysqlDatabase(dbName: string, dbUser: string): Promise<void> {
    assertValidSqlIdentifier(dbName);
    assertValidSqlIdentifier(dbUser);
    const sql = [
      `DROP DATABASE IF EXISTS \`${dbName}\`;`,
      `DROP USER IF EXISTS '${dbUser}'@'localhost';`,
    ].join(' ');
    await this.runMysql(sql).catch((err) =>
      this.logger.warn(
        `Failed to fully drop MySQL db/user ${dbName}: ${(err as Error).message}`,
      ),
    );
  }

  async setMysqlPassword(dbUser: string, password: string): Promise<void> {
    assertValidSqlIdentifier(dbUser);
    const sql = `ALTER USER '${dbUser}'@'localhost' IDENTIFIED BY '${escapeSqlLiteral(password)}'; FLUSH PRIVILEGES;`;
    await this.runMysql(sql);
  }

  async createPostgresDatabase(
    dbName: string,
    dbUser: string,
    password: string,
  ): Promise<void> {
    assertValidSqlIdentifier(dbName);
    assertValidSqlIdentifier(dbUser);
    await this.runPsql(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${dbUser}') THEN CREATE ROLE "${dbUser}" LOGIN PASSWORD '${escapeSqlLiteral(password)}'; END IF; END $$;`,
    );
    await this.runPsql(`CREATE DATABASE "${dbName}" OWNER "${dbUser}";`);
  }

  async dropPostgresDatabase(dbName: string, dbUser: string): Promise<void> {
    assertValidSqlIdentifier(dbName);
    assertValidSqlIdentifier(dbUser);
    await this.runPsql(`DROP DATABASE IF EXISTS "${dbName}";`).catch((err) =>
      this.logger.warn(
        `Failed to drop Postgres db ${dbName}: ${(err as Error).message}`,
      ),
    );
    await this.runPsql(`DROP ROLE IF EXISTS "${dbUser}";`).catch((err) =>
      this.logger.warn(
        `Failed to drop Postgres role ${dbUser}: ${(err as Error).message}`,
      ),
    );
  }

  async setPostgresPassword(dbUser: string, password: string): Promise<void> {
    assertValidSqlIdentifier(dbUser);
    await this.runPsql(
      `ALTER ROLE "${dbUser}" PASSWORD '${escapeSqlLiteral(password)}';`,
    );
  }
}
