-- CreateTable
CREATE TABLE "ssh_tunnel_configs" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "localProxyPort" INTEGER NOT NULL DEFAULT 1080,
    "privateKeyPath" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ssh_tunnel_configs_pkey" PRIMARY KEY ("id")
);
