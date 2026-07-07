-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RESELLER', 'USER');

-- CreateEnum
CREATE TYPE "AppRuntime" AS ENUM ('STATIC', 'PHP', 'NODE', 'PYTHON');

-- CreateEnum
CREATE TYPE "DatabaseEngine" AS ENUM ('MYSQL', 'POSTGRES');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "diskQuotaMb" INTEGER NOT NULL DEFAULT 1024,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentRoot" TEXT NOT NULL,
    "runtime" "AppRuntime" NOT NULL DEFAULT 'STATIC',
    "phpVersion" TEXT,
    "nodeVersion" TEXT,
    "pythonVersion" TEXT,
    "appEntryPoint" TEXT,
    "appPort" INTEGER,
    "sslEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "databases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engine" "DatabaseEngine" NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "domainId" TEXT NOT NULL,

    CONSTRAINT "databases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "domains_name_key" ON "domains"("name");

-- CreateIndex
CREATE UNIQUE INDEX "databases_name_engine_key" ON "databases"("name", "engine");

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "databases" ADD CONSTRAINT "databases_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
