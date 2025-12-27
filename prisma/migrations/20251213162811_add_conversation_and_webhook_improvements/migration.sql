/*
  Warnings:

  - Added the required column `kind` to the `WebhookEventLog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "contactId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
CREATE TABLE "new_CommunicationLog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageSnippet" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "whatsappMessageId" TEXT,
    "deliveryStatus" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CommunicationLog" ("channel", "createdAt", "deliveredAt", "deliveryStatus", "direction", "failedAt", "failureReason", "id", "isRead", "leadId", "messageSnippet", "readAt", "whatsappMessageId") SELECT "channel", "createdAt", "deliveredAt", "deliveryStatus", "direction", "failedAt", "failureReason", "id", "isRead", "leadId", "messageSnippet", "readAt", "whatsappMessageId" FROM "CommunicationLog";
DROP TABLE "CommunicationLog";
ALTER TABLE "new_CommunicationLog" RENAME TO "CommunicationLog";
CREATE UNIQUE INDEX "CommunicationLog_whatsappMessageId_key" ON "CommunicationLog"("whatsappMessageId");
CREATE TABLE "new_WebhookEventLog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "info" TEXT,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_WebhookEventLog" ("createdAt", "id", "info", "ok", "provider") SELECT "createdAt", "id", "info", "ok", "provider" FROM "WebhookEventLog";
DROP TABLE "WebhookEventLog";
ALTER TABLE "new_WebhookEventLog" RENAME TO "WebhookEventLog";

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_contactId_channel_key" ON "Conversation"("contactId", "channel");
