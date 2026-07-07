import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AppInstallerService, DbCredentials } from './app-installer.service';

// The download/extract/copy pipeline shells out to curl/tar/cp, which we
// don't want to exercise in tests (no network, no fixture archives). Instead
// we reach the private helpers directly through a narrow internal-shape cast
// — the same pattern used for FirewallService's parseNumberedStatus tests —
// so we can validate the retry/backoff logic and the generated config file
// contents without mocking the whole child_process surface.
interface AppInstallerServiceInternal {
  downloadFile(
    url: string,
    destFile: string,
    timeoutSeconds: number,
  ): Promise<void>;
  downloadWithRetry(
    url: string,
    destFile: string,
    attempts?: number,
  ): Promise<void>;
  writeWordPressConfig(targetDir: string, db: DbCredentials): Promise<void>;
  writePhpMyAdminConfig(targetDir: string): Promise<void>;
}

function makeService(): AppInstallerService {
  const config = { get: jest.fn().mockReturnValue('300') };
  return new AppInstallerService(config as unknown as ConfigService);
}

function internal(service: AppInstallerService): AppInstallerServiceInternal {
  return service as unknown as AppInstallerServiceInternal;
}

describe('AppInstallerService', () => {
  describe('listCatalog / getDefinition', () => {
    it('lists the curated catalog including wordpress and phpmyadmin', () => {
      const service = makeService();
      const ids = service.listCatalog().map((a) => a.id);
      expect(ids).toEqual(['wordpress', 'phpmyadmin']);
    });

    it('returns the definition for a known app id', () => {
      const service = makeService();
      const def = service.getDefinition('wordpress');
      expect(def.name).toBe('WordPress');
      expect(def.requiresDatabase).toBe(true);
    });

    it('throws for an unknown app id', () => {
      const service = makeService();
      expect(() => service.getDefinition('not-a-real-app')).toThrow(
        'Unknown app: not-a-real-app',
      );
    });
  });

  describe('downloadWithRetry', () => {
    it('retries on failure and succeeds once downloadFile eventually resolves', async () => {
      const service = makeService();
      const spy = jest
        .spyOn(internal(service), 'downloadFile')
        .mockRejectedValueOnce(new Error('timed out'))
        .mockRejectedValueOnce(new Error('timed out again'))
        .mockResolvedValueOnce(undefined);

      await internal(service).downloadWithRetry(
        'https://example.com/file.tar.gz',
        '/tmp/whatever.tar.gz',
        3,
      );

      expect(spy).toHaveBeenCalledTimes(3);
    }, 15000);

    it('throws after exhausting all attempts', async () => {
      const service = makeService();
      jest
        .spyOn(internal(service), 'downloadFile')
        .mockRejectedValue(new Error('connection refused'));

      await expect(
        internal(service).downloadWithRetry(
          'https://example.com/file.tar.gz',
          '/tmp/whatever.tar.gz',
          2,
        ),
      ).rejects.toThrow(
        'Failed to download https://example.com/file.tar.gz after 2 attempts: connection refused',
      );
    }, 15000);
  });

  describe('config file generation', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-app-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('writes a wp-config.php with the supplied DB credentials and unique salts', async () => {
      const service = makeService();
      const db: DbCredentials = {
        host: 'localhost',
        name: 'wp_db',
        user: 'wp_user',
        password: "p'ss'word",
      };
      await internal(service).writeWordPressConfig(tmpDir, db);

      const content = await fs.readFile(
        path.join(tmpDir, 'wp-config.php'),
        'utf8',
      );
      expect(content).toContain("define('DB_NAME', 'wp_db');");
      expect(content).toContain("define('DB_USER', 'wp_user');");
      expect(content).toContain("define('DB_HOST', 'localhost');");
      // Single quotes in the password must be escaped so the generated PHP
      // is syntactically valid.
      expect(content).toContain("define('DB_PASSWORD', 'p\\'ss\\'word');");

      const authKeyMatch = /define\('AUTH_KEY', '([^']+)'\);/.exec(content);
      const nonceSaltMatch = /define\('NONCE_SALT', '([^']+)'\);/.exec(content);
      expect(authKeyMatch).not.toBeNull();
      expect(nonceSaltMatch).not.toBeNull();
      expect(authKeyMatch?.[1]).not.toEqual(nonceSaltMatch?.[1]);
    });

    it('writes a config.inc.php with a random blowfish secret', async () => {
      const service = makeService();
      await internal(service).writePhpMyAdminConfig(tmpDir);

      const content = await fs.readFile(
        path.join(tmpDir, 'config.inc.php'),
        'utf8',
      );
      expect(content).toContain("$cfg['Servers'][$i]['auth_type'] = 'cookie';");
      expect(
        /\$cfg\['blowfish_secret'\] = '([^']+)';/.exec(content)?.[1],
      ).toBeTruthy();
    });
  });
});
