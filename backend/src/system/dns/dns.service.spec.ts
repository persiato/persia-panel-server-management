import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  isValidHostnameTarget,
  isValidPriority,
  isValidRecordName,
  isValidRecordValue,
  isValidTtl,
  SystemDnsService,
} from './dns.service';

function makeService(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    BIND_ZONES_DIR: '/etc/bind/zones',
    BIND_CONFIG_DIR: '/etc/bind',
    DNS_DEFAULT_TTL: '3600',
    DNS_NS_HOSTNAMES: 'ns1.example.com,ns2.example.com',
    ...overrides,
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
  return new SystemDnsService(config as unknown as ConfigService);
}

describe('isValidRecordName', () => {
  it('accepts the zone apex, wildcards, and dotted labels', () => {
    expect(isValidRecordName('@')).toBe(true);
    expect(isValidRecordName('www')).toBe(true);
    expect(isValidRecordName('*')).toBe(true);
    expect(isValidRecordName('sub.mail')).toBe(true);
  });

  it('rejects empty or shell-hostile names', () => {
    expect(isValidRecordName('')).toBe(false);
    expect(isValidRecordName('www; rm -rf /')).toBe(false);
    expect(isValidRecordName('-leading-hyphen')).toBe(false);
  });
});

describe('isValidHostnameTarget', () => {
  it('accepts bare and trailing-dot FQDNs', () => {
    expect(isValidHostnameTarget('mail.example.com')).toBe(true);
    expect(isValidHostnameTarget('mail.example.com.')).toBe(true);
  });

  it('rejects invalid hostnames', () => {
    expect(isValidHostnameTarget('not a host')).toBe(false);
    expect(isValidHostnameTarget('')).toBe(false);
  });
});

describe('isValidRecordValue', () => {
  it('validates A/AAAA records as IPv4/IPv6 addresses', () => {
    expect(isValidRecordValue('A', '203.0.113.10')).toBe(true);
    expect(isValidRecordValue('A', 'not-an-ip')).toBe(false);
    expect(isValidRecordValue('AAAA', '2001:db8::1')).toBe(true);
    expect(isValidRecordValue('AAAA', '203.0.113.10')).toBe(false);
  });

  it('validates CNAME/MX/NS/SRV as hostname targets', () => {
    expect(isValidRecordValue('CNAME', 'target.example.com')).toBe(true);
    expect(isValidRecordValue('MX', 'mail.example.com')).toBe(true);
    expect(isValidRecordValue('NS', 'ns1.example.com')).toBe(true);
    expect(isValidRecordValue('SRV', 'sip.example.com')).toBe(true);
    expect(isValidRecordValue('CNAME', 'not a host')).toBe(false);
  });

  it('validates TXT as a non-empty, unquoted, bounded string', () => {
    expect(isValidRecordValue('TXT', 'v=spf1 -all')).toBe(true);
    expect(isValidRecordValue('TXT', '')).toBe(false);
    expect(isValidRecordValue('TXT', 'has "quotes"')).toBe(false);
    expect(isValidRecordValue('TXT', 'a'.repeat(256))).toBe(false);
  });
});

describe('isValidTtl', () => {
  it('accepts integers within the DNS-sane range', () => {
    expect(isValidTtl(3600)).toBe(true);
    expect(isValidTtl(60)).toBe(true);
    expect(isValidTtl(604800)).toBe(true);
  });

  it('rejects out-of-range or non-integer values', () => {
    expect(isValidTtl(59)).toBe(false);
    expect(isValidTtl(604801)).toBe(false);
    expect(isValidTtl(60.5)).toBe(false);
  });
});

describe('isValidPriority', () => {
  it('accepts integers 0-65535', () => {
    expect(isValidPriority(0)).toBe(true);
    expect(isValidPriority(65535)).toBe(true);
  });

  it('rejects out-of-range or non-integer values', () => {
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(65536)).toBe(false);
    expect(isValidPriority(1.5)).toBe(false);
  });
});

describe('SystemDnsService.renderZoneFile', () => {
  it('renders an SOA header, configured NS records, and every record type', () => {
    const service = makeService();
    const content = service.renderZoneFile('example.com', [
      { type: 'A', name: '@', value: '203.0.113.10', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: 'example.com', ttl: 3600 },
      {
        type: 'MX',
        name: '@',
        value: 'mail.example.com',
        ttl: 3600,
        priority: 10,
      },
      { type: 'TXT', name: '@', value: 'v=spf1 -all', ttl: 3600 },
    ]);

    expect(content).toContain('$TTL 3600');
    expect(content).toContain('SOA ns1.example.com.');
    expect(content).toContain('@ 3600 IN NS ns1.example.com.');
    expect(content).toContain('@ 3600 IN NS ns2.example.com.');
    expect(content).toContain('@ 3600 IN A 203.0.113.10');
    expect(content).toContain('www 3600 IN CNAME example.com.');
    expect(content).toContain('@ 3600 IN MX 10 mail.example.com.');
    expect(content).toContain('@ 3600 IN TXT "v=spf1 -all"');
  });

  it('escapes double quotes inside TXT values', () => {
    const service = makeService();
    const content = service.renderZoneFile('example.com', [
      { type: 'TXT', name: '@', value: 'has "quotes"', ttl: 3600 },
    ]);
    expect(content).toContain('TXT "has \\"quotes\\""');
  });

  it('falls back to a synthesized ns1 host when no NS hostnames are configured', () => {
    const service = makeService({ DNS_NS_HOSTNAMES: '' });
    const content = service.renderZoneFile('example.com', []);
    expect(content).toContain('SOA ns1.example.com.');
    expect(content).not.toMatch(/IN NS/);
  });
});

describe('SystemDnsService.writeZone', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-dns-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects an invalid domain name before writing anything to disk', async () => {
    const service = makeService({
      BIND_ZONES_DIR: path.join(tmpDir, 'zones'),
      BIND_CONFIG_DIR: path.join(tmpDir, 'bind'),
    });
    await expect(service.writeZone('not a domain', [])).rejects.toThrow(
      'Invalid domain name',
    );
    await expect(fs.readdir(tmpDir)).resolves.toEqual([]);
  });

  it('writes the zone file and registers the zone before shelling out to bind9 tools', async () => {
    const zonesDir = path.join(tmpDir, 'zones');
    const bindConfigDir = path.join(tmpDir, 'bind');
    const service = makeService({
      BIND_ZONES_DIR: zonesDir,
      BIND_CONFIG_DIR: bindConfigDir,
    });

    // named-checkzone/rndc aren't installed in this sandbox, so the call is
    // expected to eventually reject — but the file writes must have already
    // happened by that point.
    await expect(
      service.writeZone('example.com', [
        { type: 'A', name: '@', value: '203.0.113.10', ttl: 3600 },
      ]),
    ).rejects.toThrow(/ENOENT|not found/i);

    const zoneContent = await fs.readFile(
      path.join(zonesDir, 'db.example.com'),
      'utf8',
    );
    expect(zoneContent).toContain('@ 3600 IN A 203.0.113.10');

    const namedConfLocal = await fs.readFile(
      path.join(bindConfigDir, 'named.conf.local'),
      'utf8',
    );
    expect(namedConfLocal).toContain('zone "example.com"');
  });
});
