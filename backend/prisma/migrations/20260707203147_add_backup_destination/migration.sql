-- AlterTable
ALTER TABLE "backups" ADD COLUMN     "offsiteError" TEXT,
ADD COLUMN     "offsiteSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "backup_destination_configs" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "remotePath" TEXT NOT NULL,
    "privateKeyPath" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_destination_configs_pkey" PRIMARY KEY ("id")
);
