-- AlterTable
ALTER TABLE "domains" ADD COLUMN     "sslExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sslIssuedAt" TIMESTAMP(3);
