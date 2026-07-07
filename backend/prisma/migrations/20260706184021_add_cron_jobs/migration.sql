-- CreateTable
CREATE TABLE "cron_jobs" (
    "id" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "cron_jobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
