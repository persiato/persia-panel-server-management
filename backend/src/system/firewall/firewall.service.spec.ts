import { FirewallService, FirewallRule } from './firewall.service';

interface FirewallServiceInternal {
  parseNumberedStatus(output: string): FirewallRule[];
}

function internal(service: FirewallService): FirewallServiceInternal {
  return service as unknown as FirewallServiceInternal;
}

const SAMPLE_UFW_STATUS = `Status: active

     To                         Action      From
     --                         ------      ----
[ 1] 22/tcp                     ALLOW IN    Anywhere
[ 2] 80/tcp                     ALLOW IN    Anywhere
[ 3] 443/tcp                    ALLOW IN    Anywhere
[ 4] 2087/tcp                   ALLOW IN    Anywhere
[ 5] 5432/tcp                   ALLOW IN    203.0.113.4
[ 6] 22/tcp (v6)                ALLOW IN    Anywhere (v6)
`;

describe('FirewallService', () => {
  let service: FirewallService;

  beforeEach(() => {
    service = new FirewallService();
  });

  describe('parseNumberedStatus (private)', () => {
    it('parses numbered ufw rules from real-shaped output', () => {
      const rules = internal(service).parseNumberedStatus(SAMPLE_UFW_STATUS);
      expect(rules).toHaveLength(6);
      expect(rules[0]).toEqual({
        number: 1,
        to: '22/tcp',
        action: 'ALLOW IN',
        from: 'Anywhere',
      });
      expect(rules[4]).toEqual({
        number: 5,
        to: '5432/tcp',
        action: 'ALLOW IN',
        from: '203.0.113.4',
      });
    });

    it('ignores header/separator lines and returns [] for inactive/empty output', () => {
      const rules = internal(service).parseNumberedStatus('Status: inactive\n');
      expect(rules).toEqual([]);
    });
  });

  describe('addRule validation', () => {
    it('rejects out-of-range ports before ever shelling out', async () => {
      await expect(service.addRule('allow', 0)).rejects.toThrow(
        'Port must be an integer between 1 and 65535',
      );
      await expect(service.addRule('allow', 70000)).rejects.toThrow(
        'Port must be an integer between 1 and 65535',
      );
      await expect(service.addRule('allow', 1.5)).rejects.toThrow(
        'Port must be an integer between 1 and 65535',
      );
    });

    it('rejects invalid CIDR/IP "from" sources before ever shelling out', async () => {
      await expect(
        service.addRule('allow', 22, 'tcp', 'not-an-ip'),
      ).rejects.toThrow('Invalid source address: not-an-ip');
      await expect(
        service.addRule('allow', 22, 'tcp', '10.0.0.1/99'),
      ).rejects.toThrow('Invalid source address: 10.0.0.1/99');
    });

    it('rejects an IPv4 prefix beyond /32 even though it would be valid for IPv6', async () => {
      // Regression check: an IPv4 address must not be accepted with a
      // prefix length that's only meaningful for IPv6 (33-128).
      await expect(
        service.addRule('allow', 22, 'tcp', '10.0.0.1/64'),
      ).rejects.toThrow('Invalid source address: 10.0.0.1/64');
    });

    it('accepts an IPv6 address with a prefix up to /128', async () => {
      await expect(
        service.addRule('allow', 22, 'tcp', '2001:db8::1/64'),
      ).rejects.toThrow(/ENOENT|not found/i);
    });

    it('accepts a valid CIDR without throwing synchronously', async () => {
      // Will fail later trying to actually spawn `ufw` (not installed on this
      // machine) — we only assert validation itself doesn't reject it.
      await expect(
        service.addRule('allow', 22, 'tcp', '10.0.0.1/32'),
      ).rejects.toThrow(/ENOENT|not found/i);
    });
  });

  describe('deleteRule validation', () => {
    it('rejects non-positive/non-integer rule numbers', async () => {
      await expect(service.deleteRule(0)).rejects.toThrow(
        'Invalid rule number',
      );
      await expect(service.deleteRule(-1)).rejects.toThrow(
        'Invalid rule number',
      );
      await expect(service.deleteRule(1.5)).rejects.toThrow(
        'Invalid rule number',
      );
    });

    it('refuses to delete a rule guarding a protected port', async () => {
      jest.spyOn(service, 'status').mockResolvedValue({
        active: true,
        rules: [
          { number: 1, to: '22/tcp', action: 'ALLOW IN', from: 'Anywhere' },
        ],
      });
      await expect(service.deleteRule(1)).rejects.toThrow(
        'Refusing to delete rule for port 22 — required for SSH/panel/web access',
      );
    });

    it('allows deleting a rule for a non-protected port (attempts real ufw call)', async () => {
      jest.spyOn(service, 'status').mockResolvedValue({
        active: true,
        rules: [
          {
            number: 5,
            to: '5432/tcp',
            action: 'ALLOW IN',
            from: '203.0.113.4',
          },
        ],
      });
      await expect(service.deleteRule(5)).rejects.toThrow(/ENOENT|not found/i);
    });
  });
});
