/*
  Warnings:

  - You are about to drop the `ExternalEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WebhookEventLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WhatsAppTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `meta` on the `AutomationRunLog` table. All the data in the column will be lost.
  - You are about to drop the column `dueDate` on the `ChecklistItem` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `ChecklistItem` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappOptOut` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `assignedToId` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `fileUrl` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedAt` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `webhookVerifyToken` on the `Integration` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ExternalEvent_provider_eventId_key";

-- DropIndex
DROP INDEX "WhatsAppTemplate_name_key";

-- DropTable
DROP TABLE "ExternalEvent";

-- DropTable
DROP TABLE "WebhookEventLog";

-- DropTable
DROP TABLE "WhatsAppTemplate";

-- CreateTable
CREATE TABLE "ExpiryItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contactId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "type" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "reminderScheduleDays" TEXT NOT NULL DEFAULT '[90,60,30,7]',
    "lastReminderSentAt" TIMESTAMP(3),
    "notes" TEXT,
    "assignedUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpiryItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpiryItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpiryItem_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "contactId" INTEGER,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "meta" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalEventLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
CREATE TABLE "new_AIActionLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "contactId" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIActionLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AIActionLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AIActionLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AIActionLog" ("contactId", "conversationId", "createdAt", "error", "id", "kind", "leadId", "meta", "ok") SELECT "contactId", "conversationId", "createdAt", "error", "id", "kind", "leadId", "meta", "ok" FROM "AIActionLog";
DROP TABLE "AIActionLog";
ALTER TABLE "new_AIActionLog" RENAME TO "AIActionLog";
CREATE INDEX "AIActionLog_conversationId_createdAt_idx" ON "AIActionLog"("conversationId", "createdAt");
CREATE INDEX "AIActionLog_kind_createdAt_idx" ON "AIActionLog"("kind", "createdAt");
CREATE TABLE "new_AIDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "contactId" INTEGER,
    "tone" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "inputSummary" TEXT,
    "draftText" TEXT NOT NULL,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AIDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AIDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AIDraft_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AIDraft" ("contactId", "conversationId", "createdAt", "createdByUserId", "draftText", "id", "inputSummary", "language", "leadId", "promptVersion", "tone") SELECT "contactId", "conversationId", "createdAt", "createdByUserId", "draftText", "id", "inputSummary", "language", "leadId", "promptVersion", "tone" FROM "AIDraft";
DROP TABLE "AIDraft";
ALTER TABLE "new_AIDraft" RENAME TO "AIDraft";
CREATE INDEX "AIDraft_conversationId_createdAt_idx" ON "AIDraft"("conversationId", "createdAt");
CREATE INDEX "AIDraft_leadId_idx" ON "AIDraft"("leadId");
CREATE INDEX "AIDraft_contactId_idx" ON "AIDraft"("contactId");
CREATE TABLE "new_AutomationRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "key" TEXT,
    "schedule" TEXT DEFAULT 'daily',
    "template" TEXT,
    "type" TEXT,
    "channel" TEXT,
    "daysBeforeExpiry" INTEGER,
    "followupAfterDays" INTEGER,
    "trigger" TEXT,
    "conditions" TEXT,
    "actions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
INSERT INTO "new_AutomationRule" ("channel", "createdAt", "daysBeforeExpiry", "enabled", "followupAfterDays", "id", "isActive", "key", "name", "schedule", "template", "type", "updatedAt") SELECT "channel", "createdAt", "daysBeforeExpiry", coalesce("enabled", true) AS "enabled", "followupAfterDays", "id", "isActive", "key", "name", "schedule", "template", "type", "updatedAt" FROM "AutomationRule";
DROP TABLE "AutomationRule";
ALTER TABLE "new_AutomationRule" RENAME TO "AutomationRule";
CREATE UNIQUE INDEX "AutomationRule_key_key" ON "AutomationRule"("key");
CREATE TABLE "new_AutomationRunLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ruleId" INTEGER,
    "ruleKey" TEXT,
    "leadId" INTEGER,
    "contactId" INTEGER,
    "userId" INTEGER,
    "status" TEXT,
    "reason" TEXT,
    "message" TEXT,
    "details" TEXT,
    "idempotencyKey" TEXT,
    "dateKey" TEXT,
    "actionKey" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationRunLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomationRunLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomationRunLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomationRunLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AutomationRunLog" ("actionKey", "contactId", "createdAt", "dateKey", "id", "idempotencyKey", "leadId", "message", "reason", "ruleId", "ruleKey", "status") SELECT "actionKey", "contactId", "createdAt", "dateKey", "id", "idempotencyKey", "leadId", "message", "reason", "ruleId", "ruleKey", "status" FROM "AutomationRunLog";
DROP TABLE "AutomationRunLog";
ALTER TABLE "new_AutomationRunLog" RENAME TO "AutomationRunLog";
CREATE UNIQUE INDEX "AutomationRunLog_idempotencyKey_key" ON "AutomationRunLog"("idempotencyKey");
CREATE INDEX "AutomationRunLog_ruleKey_leadId_createdAt_idx" ON "AutomationRunLog"("ruleKey", "leadId", "createdAt");
CREATE INDEX "AutomationRunLog_status_createdAt_idx" ON "AutomationRunLog"("status", "createdAt");
CREATE UNIQUE INDEX "AutomationRunLog_dateKey_ruleId_leadId_actionKey_key" ON "AutomationRunLog"("dateKey", "ruleId", "leadId", "actionKey");
CREATE TABLE "new_ChecklistItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ChecklistItem" ("completed", "completedAt", "createdAt", "id", "label", "leadId", "required") SELECT "completed", "completedAt", "createdAt", "id", "label", "leadId", "required" FROM "ChecklistItem";
DROP TABLE "ChecklistItem";
ALTER TABLE "new_ChecklistItem" RENAME TO "ChecklistItem";
CREATE TABLE "new_Contact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "nationality" TEXT,
    "source" TEXT,
    "localSponsorName" TEXT,
    "companyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Contact" ("createdAt", "email", "fullName", "id", "nationality", "phone", "source") SELECT "createdAt", "email", "fullName", "id", "nationality", "phone", "source" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");
CREATE INDEX "Contact_email_idx" ON "Contact"("email");
CREATE INDEX "Contact_localSponsorName_idx" ON "Contact"("localSponsorName");
CREATE INDEX "Contact_companyName_idx" ON "Contact"("companyName");
CREATE TABLE "new_Conversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contactId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "externalThreadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedUserId" INTEGER,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("channel", "contactId", "createdAt", "id", "lastMessageAt", "status", "unreadCount", "updatedAt") SELECT "channel", "contactId", "createdAt", "id", "lastMessageAt", "status", "unreadCount", "updatedAt" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_channel_lastMessageAt_idx" ON "Conversation"("channel", "lastMessageAt");
CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");
CREATE UNIQUE INDEX "Conversation_contactId_channel_key" ON "Conversation"("contactId", "channel");
CREATE TABLE "new_Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storagePath" TEXT,
    "url" TEXT,
    "category" TEXT,
    "expiryDate" TIMESTAMP(3),
    "uploadedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("fileName", "id", "leadId") SELECT "fileName", "id", "leadId" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE TABLE "new_Integration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "webhookUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "config" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
INSERT INTO "new_Integration" ("accessToken", "apiKey", "apiSecret", "config", "createdAt", "id", "isEnabled", "lastTestMessage", "lastTestStatus", "lastTestedAt", "name", "provider", "refreshToken", "updatedAt", "webhookUrl") SELECT "accessToken", "apiKey", "apiSecret", "config", "createdAt", "id", "isEnabled", "lastTestMessage", "lastTestStatus", "lastTestedAt", "name", "provider", "refreshToken", "updatedAt", "webhookUrl" FROM "Integration";
DROP TABLE "Integration";
ALTER TABLE "new_Integration" RENAME TO "Integration";
CREATE UNIQUE INDEX "Integration_name_key" ON "Integration"("name");
CREATE TABLE "new_Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contactId" INTEGER NOT NULL,
    "leadType" TEXT,
    "serviceTypeId" INTEGER,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "serviceTypeEnum" TEXT,
    "priority" TEXT DEFAULT 'NORMAL',
    "lastContactChannel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "pipelineStage" TEXT NOT NULL DEFAULT 'new',
    "urgency" TEXT,
    "notes" TEXT,
    "priorityScore" INTEGER,
    "aiScore" INTEGER,
    "aiNotes" TEXT,
    "assignedUserId" INTEGER,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "autoWorkflowStatus" TEXT,
    "expiry90Sent" BOOLEAN NOT NULL DEFAULT false,
    "expiry30Sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("aiNotes", "aiScore", "autoWorkflowStatus", "contactId", "createdAt", "expiry30Sent", "expiry90Sent", "expiryDate", "id", "lastContactAt", "leadType", "nextFollowUpAt", "notes", "pipelineStage", "priorityScore", "serviceTypeId", "status", "updatedAt", "urgency") SELECT "aiNotes", "aiScore", "autoWorkflowStatus", "contactId", "createdAt", "expiry30Sent", "expiry90Sent", "expiryDate", "id", "lastContactAt", "leadType", "nextFollowUpAt", "notes", "pipelineStage", "priorityScore", "serviceTypeId", "status", "updatedAt", "urgency" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE TABLE "new_Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "doneAt" TIMESTAMP(3),
    "assignedUserId" INTEGER,
    "createdByUserId" INTEGER,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "doneAt", "dueAt", "id", "leadId", "title", "type") SELECT "createdAt", "doneAt", "dueAt", "id", "leadId", "title", "type" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "password", "role") SELECT "createdAt", "email", "id", "name", "password", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_leadId_idx" ON "Message"("leadId");

-- CreateIndex
CREATE INDEX "Message_contactId_idx" ON "Message"("contactId");

-- CreateIndex
CREATE INDEX "ExternalEventLog_provider_receivedAt_idx" ON "ExternalEventLog"("provider", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEventLog_provider_externalId_key" ON "ExternalEventLog"("provider", "externalId");
