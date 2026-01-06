-- Add aiState and aiLockUntil to Conversation
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "aiState" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "aiLockUntil" TIMESTAMP(3);

-- Create AiReplyDedup table
CREATE TABLE IF NOT EXISTS "AiReplyDedup" (
  "id" SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL,
  "inboundMessageId" INTEGER,
  "aiActionType" TEXT NOT NULL DEFAULT 'auto_reply',
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "outboundMessageId" INTEGER,
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  CONSTRAINT "AiReplyDedup_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiReplyDedup_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "AiReplyDedup_conversationId_createdAt_idx" ON "AiReplyDedup"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiReplyDedup_inboundMessageId_idx" ON "AiReplyDedup"("inboundMessageId");
CREATE INDEX IF NOT EXISTS "AiReplyDedup_idempotencyKey_idx" ON "AiReplyDedup"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AiReplyDedup_status_createdAt_idx" ON "AiReplyDedup"("status", "createdAt");

