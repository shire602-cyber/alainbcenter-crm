-- CreateTable: MessageStatusEvent (if not exists)
CREATE TABLE IF NOT EXISTS "MessageStatusEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "messageId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "providerStatus" TEXT,
    "errorMessage" TEXT,
    "rawPayload" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageStatusEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MessageStatusEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Add columns to Conversation if not exists
-- Note: These columns may already exist from previous migrations
-- ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "waConversationId" TEXT;
-- ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "waUserWaId" TEXT;

-- Add columns to Message if not exists
-- Note: These columns may already exist from previous migrations
-- ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'text';
-- ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT;
-- ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaMimeType" TEXT;
-- ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
-- ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "rawPayload" TEXT;
-- ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);

-- CreateIndex: MessageStatusEvent indexes
CREATE INDEX IF NOT EXISTS "MessageStatusEvent_messageId_receivedAt_idx" ON "MessageStatusEvent"("messageId", "receivedAt");
CREATE INDEX IF NOT EXISTS "MessageStatusEvent_conversationId_receivedAt_idx" ON "MessageStatusEvent"("conversationId", "receivedAt");
CREATE INDEX IF NOT EXISTS "MessageStatusEvent_status_receivedAt_idx" ON "MessageStatusEvent"("status", "receivedAt");

-- CreateIndex: Message providerMessageId unique index (if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "Message_providerMessageId_key" ON "Message"("providerMessageId");

-- CreateIndex: Message providerMessageId index (if not exists)
CREATE INDEX IF NOT EXISTS "Message_providerMessageId_idx" ON "Message"("providerMessageId");


















