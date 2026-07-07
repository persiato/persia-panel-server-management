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
function groupExists(name: string): boolean {
  try {
    execFileSync('getent', ['group', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureSystemUser(username: string, homeDir: string): void {
  try {
    execFileSync('id', ['-u', username], { stdio: 'ignore' });
    return; // already exists
  } catch {
    // fall through and create it
  }
  // useradd's default behavior is to create a new group with the same name
  // as the user for its primary group. Some cloud VM images (this is what
  // hit us on the reference deployment) already ship a group named e.g.
  // "admin" for unrelated purposes (cloud-init admin tooling, etc.) — in
  // that case plain `useradd admin` fails with "group admin exists" (exit
  // 9). If that group already exists, reuse it as the primary group via
  // `-g` instead of trying to create a new one.
  const useraddArgs = [
    '--home-dir',
    homeDir,
    '--no-create-home',
    '--shell',
    '/usr/sbin/nologin',
  ];
  if (groupExists(username)) {
    useraddArgs.push('-g', username);
  }
  useraddArgs.push(username);

  try {
    // Without `encoding`, execFileSync defaults to returning stdout/stderr as
    // raw Buffers on a thrown error — which console.error(err) then prints
    // as an unreadable "<Buffer 20 74 6f ...>" hex dump instead of the
    // actual useradd error text. Force utf8 so failures are legible.
    execFileSync('useradd', useraddArgs, { encoding: 'utf8' });
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    throw new Error(
      `useradd failed for "${username}": ${e.stderr?.trim() || e.stdout?.trim() || e.message}`,
    );
  }
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
    // Deliberately does NOT touch passwordHash here: this seed step also runs
    // on every re-deploy (installer/deploy.sh calls it unconditionally), and
    // an admin may have already changed their password since the last
    // install. Silently resetting it on every redeploy would be worse than
    // this skip. The PP_SEED_STATUS marker lets deploy.sh detect this case
    // and avoid printing a "first login" password that won't actually work
    // (this exact confusion — a freshly generated ADMIN_PASSWORD in .env
    // that doesn't match the real, already-existing password hash — is what
    // caused repeated "Invalid credentials" reports after reinstalls).
    console.log('Admin user already exists, skipping.');
    console.log('PP_SEED_STATUS=SKIPPED');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, username, passwordHash, role: 'ADMIN', diskQuotaMb: 0 },
  });
  console.log(`Admin user "${username}" created.`);
  console.log('PP_SEED_STATUS=CREATED');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
