-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "lastInboundAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "lastOutboundAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "needsReplySince" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "slaBreachAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "priorityScore" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Conversation_assignedUserId_lastMessageAt_idx" ON "Conversation"("assignedUserId", "lastMessageAt");

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "conversationId" INTEGER;
ALTER TABLE "Task" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_idempotencyKey_key" ON "Task"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Task_conversationId_idx" ON "Task"("conversationId");

-- AddForeignKey
CREATE TABLE "new_Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "doneAt" DATETIME,
    "assignedUserId" INTEGER,
    "createdByUserId" INTEGER,
    "aiSuggested" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("id", "leadId", "title", "type", "dueAt", "status", "doneAt", "assignedUserId", "createdByUserId", "aiSuggested", "createdAt", "updatedAt") SELECT "id", "leadId", "title", "type", "dueAt", "status", "doneAt", "assignedUserId", "createdByUserId", "aiSuggested", "createdAt", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_idempotencyKey_key" ON "Task"("idempotencyKey");
CREATE INDEX "Task_conversationId_idx" ON "Task"("conversationId");




-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "lastInboundAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "lastOutboundAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "needsReplySince" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "slaBreachAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "priorityScore" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Conversation_assignedUserId_lastMessageAt_idx" ON "Conversation"("assignedUserId", "lastMessageAt");

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "conversationId" INTEGER;
ALTER TABLE "Task" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_idempotencyKey_key" ON "Task"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Task_conversationId_idx" ON "Task"("conversationId");

-- AddForeignKey
CREATE TABLE "new_Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "doneAt" DATETIME,
    "assignedUserId" INTEGER,
    "createdByUserId" INTEGER,
    "aiSuggested" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("id", "leadId", "title", "type", "dueAt", "status", "doneAt", "assignedUserId", "createdByUserId", "aiSuggested", "createdAt", "updatedAt") SELECT "id", "leadId", "title", "type", "dueAt", "status", "doneAt", "assignedUserId", "createdByUserId", "aiSuggested", "createdAt", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_idempotencyKey_key" ON "Task"("idempotencyKey");
CREATE INDEX "Task_conversationId_idx" ON "Task"("conversationId");
















