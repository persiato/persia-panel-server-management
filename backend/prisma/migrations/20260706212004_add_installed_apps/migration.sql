-- CreateEnum
CREATE TYPE "InstallStatus" AS ENUM ('INSTALLING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "installed_apps" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL DEFAULT '',
    "status" "InstallStatus" NOT NULL DEFAULT 'INSTALLING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "domainId" TEXT NOT NULL,
    "databaseId" TEXT,

    CONSTRAINT "installed_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "installed_apps_databaseId_key" ON "installed_apps"("databaseId");

-- AddForeignKey
ALTER TABLE "installed_apps" ADD CONSTRAINT "installed_apps_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installed_apps" ADD CONSTRAINT "installed_apps_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "databases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
