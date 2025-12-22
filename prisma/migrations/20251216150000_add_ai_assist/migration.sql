-- CreateTable
CREATE TABLE "AIDraft" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AIActionLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "contactId" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AIDraft_conversationId_createdAt_idx" ON "AIDraft"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIDraft_leadId_idx" ON "AIDraft"("leadId");

-- CreateIndex
CREATE INDEX "AIDraft_contactId_idx" ON "AIDraft"("contactId");

-- CreateIndex
CREATE INDEX "AIActionLog_conversationId_createdAt_idx" ON "AIActionLog"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIActionLog_kind_createdAt_idx" ON "AIActionLog"("kind", "createdAt");























