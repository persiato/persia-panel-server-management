import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const prisma = new PrismaClient();

// Mirrors RuntimeService.ensureSystemUser(). This script runs standalone
// (outside Nest's DI container), so the logic is duplicated rather than
// imported. Without this, the seeded admin has no matching Linux account,
// and the first php-fpm pool / cron job / app install created for it fails
// (php-fpm even takes the whole service down when a pool's `user =` doesn't
// resolve) — this is exactly what happened on the reference deployment.
function ensureSystemUser(username: string, homeDir: string): void {
  try {
    execFileSync('id', ['-u', username], { stdio: 'ignore' });
    return; // already exists
  } catch {
    // fall through and create it
  }
  execFileSync('useradd', [
    '--home-dir',
    homeDir,
    '--no-create-home',
    '--shell',
    '/usr/sbin/nologin',
    username,
  ]);
  console.log(`System user "${username}" created (home: ${homeDir}).`);
}

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@localhost';
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const webroot = process.env.PANEL_WEBROOT ?? '/home';

  if (!password) {
    throw new Error('Set ADMIN_PASSWORD env var before running the seed script');
  }

  ensureSystemUser(username, path.join(webroot, username));

  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (existing) {
    console.log('Admin user already exists, skipping.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, username, passwordHash, role: 'ADMIN', diskQuotaMb: 0 },
  });
  console.log(`Admin user "${username}" created.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
