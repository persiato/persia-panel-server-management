import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Standalone recovery script — run this whenever you're locked out of the
// admin account (e.g. deploy.sh printed a "first login" password that
// doesn't work because a user row with that username/email already existed
// in the database from an earlier install attempt on this same server, so
// prisma/seed.ts silently skipped creating/updating it).
//
// Usage:
//   cd backend
//   ADMIN_USERNAME=admin NEW_PASSWORD='...' npx ts-node prisma/reset-admin-password.ts
//
// ADMIN_USERNAME defaults to "admin" if unset. NEW_PASSWORD is required.
async function main() {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const newPassword = process.env.NEW_PASSWORD;

  if (!newPassword) {
    throw new Error(
      'Set NEW_PASSWORD env var before running this script, e.g.:\n' +
        "  NEW_PASSWORD='...' npx ts-node prisma/reset-admin-password.ts",
    );
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ username }, { email: username }] },
  });
  if (!user) {
    throw new Error(
      `No user found with username or email "${username}" — check the value and try again.`,
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  console.log(`Password reset for user "${user.username}" (${user.email}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
