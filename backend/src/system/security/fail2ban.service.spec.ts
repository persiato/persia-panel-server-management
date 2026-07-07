import { promisify } from 'node:util';

const SAMPLE_STATUS = `Status
|- Number of jail:      1
\`- Jail list:   sshd
`;

const SAMPLE_JAIL_STATUS = `Status for the jail: sshd
|- Filter
|  |- Currently failed: 2
|  |- Total failed:     37
|  \`- File list:        /var/log/auth.log
\`- Actions
   |- Currently banned: 2
   |- Total banned:     9
   \`- Banned IP list:   203.0.113.4 198.51.100.7
`;

// `execFile` has built-in custom-promisify support (it defines
// util.promisify.custom), so a bare jest.fn() mock loses that behavior when
// wrapped in promisify(). Replicate the same custom-promisify wiring here so
// `promisify(execFile)` inside fail2ban.service.ts resolves through our mock.
const mockExecFileAsync = jest.fn();

jest.mock('node:child_process', () => {
  const actual =
    jest.requireActual<typeof import('node:child_process')>(
      'node:child_process',
    );
  const execFileMock = Object.assign(jest.fn(), {
    [promisify.custom]: mockExecFileAsync,
  });
  return { ...actual, execFile: execFileMock };
});

import { Fail2banService } from './fail2ban.service';

describe('Fail2banService', () => {
  let service: Fail2banService;

  beforeEach(() => {
    service = new Fail2banService();
    mockExecFileAsync.mockReset();
  });

  describe('listJails', () => {
    it('parses the jail list line from fail2ban-client status', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: SAMPLE_STATUS,
        stderr: '',
      });
      const jails = await service.listJails();
      expect(mockExecFileAsync).toHaveBeenCalledWith('fail2ban-client', [
        'status',
      ]);
      expect(jails).toEqual(['sshd']);
    });

    it('returns [] when no jails are configured', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'Status\n|- Number of jail:\t0\n`- Jail list:\t\n',
        stderr: '',
      });
      expect(await service.listJails()).toEqual([]);
    });
  });

  describe('jailStatus', () => {
    it('parses failed/banned counters and banned IP list', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: SAMPLE_JAIL_STATUS,
        stderr: '',
      });
      const status = await service.jailStatus('sshd');
      expect(mockExecFileAsync).toHaveBeenCalledWith('fail2ban-client', [
        'status',
        'sshd',
      ]);
      expect(status).toEqual({
        name: 'sshd',
        currentlyFailed: 2,
        totalFailed: 37,
        currentlyBanned: 2,
        totalBanned: 9,
        bannedIps: ['203.0.113.4', '198.51.100.7'],
      });
    });

    it('rejects jail names that do not match the allowed pattern', async () => {
      await expect(service.jailStatus('sshd; rm -rf /')).rejects.toThrow(
        'Invalid jail name: sshd; rm -rf /',
      );
      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('composes listJails + jailStatus for every configured jail', async () => {
      mockExecFileAsync.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === 'status' && args.length === 1) {
          return Promise.resolve({ stdout: SAMPLE_STATUS, stderr: '' });
        }
        return Promise.resolve({ stdout: SAMPLE_JAIL_STATUS, stderr: '' });
      });
      const all = await service.status();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('sshd');
      expect(all[0].bannedIps).toEqual(['203.0.113.4', '198.51.100.7']);
    });
  });

  describe('banIp / unbanIp', () => {
    it('rejects invalid IP addresses without shelling out', async () => {
      await expect(service.banIp('sshd', 'not-an-ip')).rejects.toThrow(
        'Invalid IP address: not-an-ip',
      );
      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('calls fail2ban-client set <jail> banip <ip> for valid input', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
      await service.banIp('sshd', '203.0.113.4');
      expect(mockExecFileAsync).toHaveBeenCalledWith('fail2ban-client', [
        'set',
        'sshd',
        'banip',
        '203.0.113.4',
      ]);
    });

    it('calls fail2ban-client set <jail> unbanip <ip> for valid input', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
      await service.unbanIp('sshd', '203.0.113.4');
      expect(mockExecFileAsync).toHaveBeenCalledWith('fail2ban-client', [
        'set',
        'sshd',
        'unbanip',
        '203.0.113.4',
      ]);
    });
  });
});
