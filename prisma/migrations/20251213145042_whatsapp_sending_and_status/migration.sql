/*
  Warnings:

  - You are about to drop the column `category` on the `WhatsAppTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `WhatsAppTemplate` table. All the data in the column will be lost.
  - Added the required column `body` to the `WhatsAppTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "WebhookEventLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "info" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WhatsAppTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en_US',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WhatsAppTemplate" ("createdAt", "id", "language", "name", "status", "updatedAt") SELECT "createdAt", "id", "language", "name", "status", "updatedAt" FROM "WhatsAppTemplate";
DROP TABLE "WhatsAppTemplate";
ALTER TABLE "new_WhatsAppTemplate" RENAME TO "WhatsAppTemplate";
CREATE UNIQUE INDEX "WhatsAppTemplate_name_key" ON "WhatsAppTemplate"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
