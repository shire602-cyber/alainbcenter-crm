/*
  Warnings:

  - Added the required column `kind` to the `WebhookEventLog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Conversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contactId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CommunicationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageSnippet" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "whatsappMessageId" TEXT,
    "deliveryStatus" TEXT,
    "deliveredAt" DATETIME,
    "readAt" DATETIME,
    "failedAt" DATETIME,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CommunicationLog" ("channel", "createdAt", "deliveredAt", "deliveryStatus", "direction", "failedAt", "failureReason", "id", "isRead", "leadId", "messageSnippet", "readAt", "whatsappMessageId") SELECT "channel", "createdAt", "deliveredAt", "deliveryStatus", "direction", "failedAt", "failureReason", "id", "isRead", "leadId", "messageSnippet", "readAt", "whatsappMessageId" FROM "CommunicationLog";
DROP TABLE "CommunicationLog";
ALTER TABLE "new_CommunicationLog" RENAME TO "CommunicationLog";
CREATE UNIQUE INDEX "CommunicationLog_whatsappMessageId_key" ON "CommunicationLog"("whatsappMessageId");
CREATE TABLE "new_WebhookEventLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "info" TEXT,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_WebhookEventLog" ("createdAt", "id", "info", "ok", "provider") SELECT "createdAt", "id", "info", "ok", "provider" FROM "WebhookEventLog";
DROP TABLE "WebhookEventLog";
ALTER TABLE "new_WebhookEventLog" RENAME TO "WebhookEventLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_contactId_channel_key" ON "Conversation"("contactId", "channel");
