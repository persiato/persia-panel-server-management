import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as path from 'node:path';
import { DnsRecordType } from '@prisma/client';
import {
  assertValidDomainName,
  isValidDomainName,
} from '../../common/validators/domain-name';

const execFileAsync = promisify(execFile);

// A relative record name: the zone apex ("@"), a single label ("www"), or a
// dot-separated sequence of labels ("sub.mail") — same charset as a domain
// label, wildcards ("*") allowed, just without requiring a full FQDN.
const RECORD_NAME_RE =
  /^(@|\*|[a-zA-Z0-9*](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9*](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;

export function isValidRecordName(name: string): boolean {
  return RECORD_NAME_RE.test(name);
}

// A bare hostname target (used for CNAME/MX/NS/SRV values) — same rules as a
// domain name, but also accepts a trailing dot since that's the idiomatic
// fully-qualified notation inside a zone file.
export function isValidHostnameTarget(value: string): boolean {
  const bare = value.endsWith('.') ? value.slice(0, -1) : value;
  return isValidDomainName(bare);
}

export function isValidRecordValue(
  type: DnsRecordType,
  value: string,
): boolean {
  switch (type) {
    case 'A':
      return net.isIPv4(value);
    case 'AAAA':
      return net.isIPv6(value);
    case 'CNAME':
    case 'MX':
    case 'NS':
    case 'SRV':
      return isValidHostnameTarget(value);
    case 'TXT':
      // Free text, but it must fit in a single quoted zone-file string and
      // must not contain an unescaped double-quote (would break the file).
      return value.length > 0 && value.length <= 255 && !value.includes('"');
    default:
      return false;
  }
}

export function isValidTtl(ttl: number): boolean {
  return Number.isInteger(ttl) && ttl >= 60 && ttl <= 604800;
}

export function isValidPriority(priority: number): boolean {
  return Number.isInteger(priority) && priority >= 0 && priority <= 65535;
}

export interface DnsRecordInput {
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  priority?: number | null;
}

// Manages BIND9 zone files as the authoritative DNS server for domains
// hosted on this panel. Mirrors NginxService's idiom exactly: re-render the
// whole config artifact (here, a zone file) from the full current data set
// on every change, write it to a system path, then validate + reload the
// underlying daemon — rather than trying to patch the file in place.
@Injectable()
export class SystemDnsService {
  private readonly logger = new Logger(SystemDnsService.name);
  private readonly zonesDir: string;
  private readonly bindConfigDir: string;
  private readonly defaultTtl: number;
  private readonly nsHostnames: string[];
  private readonly publicIp?: string;

  constructor(private readonly config: ConfigService) {
    this.zonesDir = this.config.get<string>(
      'BIND_ZONES_DIR',
      '/etc/bind/zones',
    );
    this.bindConfigDir = this.config.get<string>(
      'BIND_CONFIG_DIR',
      '/etc/bind',
    );
    this.defaultTtl = Number(
      this.config.get<string>('DNS_DEFAULT_TTL', '3600'),
    );
    const nsRaw = this.config.get<string>('DNS_NS_HOSTNAMES', '');
    this.nsHostnames = nsRaw
      ? nsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    this.publicIp = this.config.get<string>('SERVER_PUBLIC_IP');
  }

  // BIND's `named-checkzone` fatally rejects any zone with no NS records at
  // the apex ("has no NS records") — it won't just warn, it refuses to load
  // the zone at all, which is what turned every DNS record add/update into
  // an Internal Server Error on installs that leave DNS_NS_HOSTNAMES unset
  // (its documented "leave empty to skip NS records while testing" behavior
  // was never actually safe). Rather than require every install to go
  // configure real nameserver hostnames up front, fall back to this panel
  // acting as the domain's own nameserver (ns1./ns2.<domain>) — the same
  // default posture as cPanel/DirectAdmin/etc when no custom NS pair is set.
  private effectiveNsHostnames(domainName: string): string[] {
    return this.nsHostnames.length > 0
      ? this.nsHostnames
      : [`ns1.${domainName}`, `ns2.${domainName}`];
  }

  zoneFilePath(domainName: string): string {
    return path.join(this.zonesDir, `db.${domainName}`);
  }

  private namedConfLocalPath(): string {
    return path.join(this.bindConfigDir, 'named.conf.local');
  }

  private namedConfPath(): string {
    return path.join(this.bindConfigDir, 'named.conf');
  }

  private zoneStanza(domainName: string): string {
    return `zone "${domainName}" { type master; file "${this.zoneFilePath(domainName)}"; };`;
  }

  private fqdn(value: string): string {
    return value.endsWith('.') ? value : `${value}.`;
  }

  private serial(): number {
    // BIND serials must be a monotonically-increasing 32-bit unsigned int;
    // unix seconds comfortably satisfies both constraints without needing
    // any persisted "last serial" state.
    return Math.floor(Date.now() / 1000);
  }

  renderZoneFile(domainName: string, records: DnsRecordInput[]): string {
    const nsHostnames = this.effectiveNsHostnames(domainName);
    const soaHost = this.fqdn(nsHostnames[0]);
    const lines = [
      '; Managed by Persia Panel — do not edit manually',
      `$TTL ${this.defaultTtl}`,
      `@ IN SOA ${soaHost} hostmaster.${domainName}. (`,
      `    ${this.serial()} ; serial`,
      '    3600       ; refresh',
      '    900        ; retry',
      '    1209600    ; expire',
      `    ${this.defaultTtl} )    ; minimum`,
      '',
    ];

    for (const ns of nsHostnames) {
      lines.push(`@ ${this.defaultTtl} IN NS ${this.fqdn(ns)}`);
    }

    // Glue: if an NS hostname lives inside this same zone (e.g. our default
    // ns1./ns2.<domain>) it needs its own A record here, or BIND has no
    // address to actually reach it at. Only add it when the admin hasn't
    // already defined that name explicitly, and only when we know an IP to
    // point it at.
    if (this.publicIp) {
      for (const ns of nsHostnames) {
        const suffix = `.${domainName}`;
        if (ns !== domainName && !ns.endsWith(suffix)) continue;
        const label = ns === domainName ? '@' : ns.slice(0, -suffix.length);
        const alreadyDefined = records.some(
          (r) => r.type === 'A' && r.name === label,
        );
        if (!alreadyDefined) {
          lines.push(`${label} ${this.defaultTtl} IN A ${this.publicIp}`);
        }
      }
    }

    for (const r of records) {
      switch (r.type) {
        case 'MX':
          lines.push(
            `${r.name} ${r.ttl} IN MX ${r.priority ?? 10} ${this.fqdn(r.value)}`,
          );
          break;
        case 'CNAME':
        case 'NS':
          lines.push(`${r.name} ${r.ttl} IN ${r.type} ${this.fqdn(r.value)}`);
          break;
        case 'SRV':
          lines.push(
            `${r.name} ${r.ttl} IN SRV ${r.priority ?? 0} ${this.fqdn(r.value)}`,
          );
          break;
        case 'TXT':
          lines.push(
            `${r.name} ${r.ttl} IN TXT "${r.value.replace(/"/g, '\\"')}"`,
          );
          break;
        default:
          // A / AAAA
          lines.push(`${r.name} ${r.ttl} IN ${r.type} ${r.value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  // Adds a `zone { ... };` stanza to named.conf.local if not already present.
  // Returns true if the zone was newly registered (meaning bind needs a full
  // `rndc reconfig`, not just a `rndc reload <zone>`, to pick it up).
  private async ensureZoneRegistered(domainName: string): Promise<boolean> {
    const confPath = this.namedConfLocalPath();
    let content = '';
    try {
      content = await fs.readFile(confPath, 'utf8');
    } catch {
      content = '';
    }
    if (content.includes(`zone "${domainName}"`)) return false;
    await fs.mkdir(this.bindConfigDir, { recursive: true });
    await fs.appendFile(confPath, `${this.zoneStanza(domainName)}\n`);
    return true;
  }

  private async unregisterZone(domainName: string): Promise<void> {
    const confPath = this.namedConfLocalPath();
    let content: string;
    try {
      content = await fs.readFile(confPath, 'utf8');
    } catch {
      return;
    }
    const escaped = domainName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stanzaRe = new RegExp(`^zone "${escaped}".*$\\n?`, 'm');
    const updated = content.replace(stanzaRe, '');
    if (updated !== content) {
      await fs.writeFile(confPath, updated);
    }
  }

  async writeZone(
    domainName: string,
    records: DnsRecordInput[],
  ): Promise<void> {
    assertValidDomainName(domainName);
    await fs.mkdir(this.zonesDir, { recursive: true });
    const content = this.renderZoneFile(domainName, records);
    await fs.writeFile(this.zoneFilePath(domainName), content, {
      mode: 0o644,
    });

    const isNewZone = await this.ensureZoneRegistered(domainName);

    try {
      await execFileAsync('named-checkzone', [
        domainName,
        this.zoneFilePath(domainName),
      ]);
      if (isNewZone) {
        await execFileAsync('named-checkconf', [this.namedConfPath()]);
        await execFileAsync('rndc', ['reconfig']);
      } else {
        await execFileAsync('rndc', ['reload', domainName]);
      }
    } catch (err) {
      this.logger.error(
        `bind9 zone check/reload failed for ${domainName}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async removeZone(domainName: string): Promise<void> {
    assertValidDomainName(domainName);
    await this.unregisterZone(domainName);
    await fs.rm(this.zoneFilePath(domainName), { force: true });
    await execFileAsync('rndc', ['reconfig']).catch((err: Error) =>
      this.logger.warn(
        `Could not reconfig bind9 after removing zone ${domainName}: ${err.message}`,
      ),
    );
  }
}
