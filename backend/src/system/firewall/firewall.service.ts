import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as net from 'node:net';

const execFileAsync = promisify(execFile);

export interface FirewallRule {
  number: number;
  to: string;
  action: string;
  from: string;
}

export type FirewallAction = 'allow' | 'deny';
export type FirewallProto = 'tcp' | 'udp';

// A conservative allowlist of ports the panel itself depends on — blocking
// any of these via the UI would either lock the admin out (SSH, panel UI)
// or break every hosted site (HTTP/HTTPS), so removing them is refused.
const PROTECTED_PORTS = new Set([22, 80, 443, 2087]);

function isValidCidrOrIp(value: string): boolean {
  const [addr, prefix] = value.split('/');
  const ipVersion = net.isIP(addr);
  if (ipVersion === 0) return false;
  if (prefix === undefined) return true;
  const prefixNum = Number(prefix);
  const maxPrefix = ipVersion === 6 ? 128 : 32;
  return (
    Number.isInteger(prefixNum) && prefixNum >= 0 && prefixNum <= maxPrefix
  );
}

@Injectable()
export class FirewallService {
  private readonly logger = new Logger(FirewallService.name);

  async status(): Promise<{ active: boolean; rules: FirewallRule[] }> {
    const { stdout } = await execFileAsync('ufw', ['status', 'numbered']);
    return {
      active: /^Status:\s*active/im.test(stdout),
      rules: this.parseNumberedStatus(stdout),
    };
  }

  private parseNumberedStatus(output: string): FirewallRule[] {
    const rules: FirewallRule[] = [];
    for (const rawLine of output.split('\n')) {
      const line = rawLine.trim();
      const match = /^\[\s*(\d+)\]\s+(.*)$/.exec(line);
      if (!match) continue;
      const parts = match[2]
        .split(/\s{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 3) continue;
      const [to, action, from] = parts;
      rules.push({ number: Number(match[1]), to, action, from });
    }
    return rules;
  }

  async addRule(
    action: FirewallAction,
    port: number,
    proto: FirewallProto = 'tcp',
    from?: string,
  ): Promise<void> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Port must be an integer between 1 and 65535');
    }
    if (from !== undefined && !isValidCidrOrIp(from)) {
      throw new Error(`Invalid source address: ${from}`);
    }

    const args = from
      ? [
          action,
          'from',
          from,
          'to',
          'any',
          'port',
          String(port),
          'proto',
          proto,
        ]
      : [action, `${port}/${proto}`];

    await execFileAsync('ufw', args).catch((err: Error) => {
      this.logger.error(`ufw ${args.join(' ')} failed: ${err.message}`);
      throw err;
    });
  }

  async deleteRule(ruleNumber: number): Promise<void> {
    if (!Number.isInteger(ruleNumber) || ruleNumber < 1) {
      throw new Error('Invalid rule number');
    }
    const { rules } = await this.status();
    const rule = rules.find((r) => r.number === ruleNumber);
    if (rule) {
      const port = Number.parseInt(rule.to, 10);
      if (PROTECTED_PORTS.has(port)) {
        throw new Error(
          `Refusing to delete rule for port ${port} — required for SSH/panel/web access`,
        );
      }
    }
    await execFileAsync('ufw', ['--force', 'delete', String(ruleNumber)]).catch(
      (err: Error) => {
        this.logger.error(`ufw delete ${ruleNumber} failed: ${err.message}`);
        throw err;
      },
    );
  }
}
