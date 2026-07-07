import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as net from 'node:net';

const execFileAsync = promisify(execFile);

// Jail names are interpolated into `fail2ban-client` args (still via execFile
// array args, never a shell), but are also used to build config file paths
// elsewhere in principle, so keep this strict regardless.
const JAIL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export interface JailStatus {
  name: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  bannedIps: string[];
}

@Injectable()
export class Fail2banService {
  private readonly logger = new Logger(Fail2banService.name);

  private assertValidJail(jail: string): void {
    if (!JAIL_NAME_RE.test(jail)) {
      throw new Error(`Invalid jail name: ${jail}`);
    }
  }

  async listJails(): Promise<string[]> {
    const { stdout } = await execFileAsync('fail2ban-client', ['status']);
    const match = /Jail list:\s*(.*)/.exec(stdout);
    if (!match || !match[1].trim()) return [];
    return match[1]
      .split(',')
      .map((j) => j.trim())
      .filter(Boolean);
  }

  async jailStatus(jail: string): Promise<JailStatus> {
    this.assertValidJail(jail);
    const { stdout } = await execFileAsync('fail2ban-client', ['status', jail]);
    const num = (re: RegExp): number => {
      const m = re.exec(stdout);
      return m ? Number.parseInt(m[1], 10) : 0;
    };
    const bannedIpsMatch = /Banned IP list:\s*(.*)/.exec(stdout);
    return {
      name: jail,
      currentlyFailed: num(/Currently failed:\s*(\d+)/),
      totalFailed: num(/Total failed:\s*(\d+)/),
      currentlyBanned: num(/Currently banned:\s*(\d+)/),
      totalBanned: num(/Total banned:\s*(\d+)/),
      bannedIps: bannedIpsMatch
        ? bannedIpsMatch[1].split(/\s+/).filter(Boolean)
        : [],
    };
  }

  async status(): Promise<JailStatus[]> {
    const jails = await this.listJails();
    return Promise.all(jails.map((jail) => this.jailStatus(jail)));
  }

  async banIp(jail: string, ip: string): Promise<void> {
    this.assertValidJail(jail);
    if (net.isIP(ip) === 0) {
      throw new Error(`Invalid IP address: ${ip}`);
    }
    await execFileAsync('fail2ban-client', ['set', jail, 'banip', ip]).catch(
      (err: Error) => {
        this.logger.error(`fail2ban-client banip failed: ${err.message}`);
        throw err;
      },
    );
  }

  async unbanIp(jail: string, ip: string): Promise<void> {
    this.assertValidJail(jail);
    if (net.isIP(ip) === 0) {
      throw new Error(`Invalid IP address: ${ip}`);
    }
    await execFileAsync('fail2ban-client', ['set', jail, 'unbanip', ip]).catch(
      (err: Error) => {
        this.logger.error(`fail2ban-client unbanip failed: ${err.message}`);
        throw err;
      },
    );
  }
}
