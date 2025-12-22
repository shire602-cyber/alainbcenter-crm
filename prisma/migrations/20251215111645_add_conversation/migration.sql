/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `CommunicationLog` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN "body" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN "externalId" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN "from" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN "meta" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN "to" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contactId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedToId" INTEGER,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("channel", "contactId", "createdAt", "id", "lastMessageAt", "updatedAt") SELECT "channel", "contactId", "createdAt", "id", "lastMessageAt", "updatedAt" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_channel_lastMessageAt_idx" ON "Conversation"("channel", "lastMessageAt");
CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");
CREATE UNIQUE INDEX "Conversation_contactId_channel_key" ON "Conversation"("contactId", "channel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationLog_externalId_key" ON "CommunicationLog"("externalId");

-- CreateIndex
CREATE INDEX "CommunicationLog_conversationId_createdAt_idx" ON "CommunicationLog"("conversationId", "createdAt");
