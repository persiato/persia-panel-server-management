import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';

const LINUX_USERNAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;

function execFileWithInput(
  file: string,
  args: string[],
  input: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, (err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    child.stdin?.end(input);
  });
}

export interface CrontabLine {
  schedule: string;
  command: string;
}

@Injectable()
export class CrontabService {
  private readonly logger = new Logger(CrontabService.name);

  async sync(username: string, jobs: CrontabLine[]): Promise<void> {
    if (!LINUX_USERNAME_RE.test(username)) {
      throw new Error(`Invalid system username: ${username}`);
    }
    const header = '# Managed by Persia Panel — do not edit manually\n';
    const body = jobs.map((j) => `${j.schedule} ${j.command}`).join('\n');
    const content = `${header}${body}${body ? '\n' : ''}`;

    try {
      await execFileWithInput('crontab', ['-u', username, '-'], content);
    } catch (err) {
      this.logger.error(
        `Failed to sync crontab for ${username}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
