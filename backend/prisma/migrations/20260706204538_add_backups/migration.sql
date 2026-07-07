-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "backups" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "domainId" TEXT NOT NULL,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
