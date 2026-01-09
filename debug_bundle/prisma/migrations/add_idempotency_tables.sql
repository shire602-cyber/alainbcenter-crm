-- Migration: Add InboundMessageDedup and OutboundMessageLog tables for hard idempotency
-- Also add Conversation flow state fields

-- Add flow state fields to Conversation table
ALTER TABLE "Conversation" 
ADD COLUMN IF NOT EXISTS "flowKey" TEXT,
ADD COLUMN IF NOT EXISTS "flowStep" TEXT,
ADD COLUMN IF NOT EXISTS "lastQuestionKey" TEXT,
ADD COLUMN IF NOT EXISTS "lastQuestionAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "collectedData" TEXT; -- JSON stored as text

-- Create InboundMessageDedup table
CREATE TABLE IF NOT EXISTS "InboundMessageDedup" (
  "id" SERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL UNIQUE,
  "conversationId" INTEGER,
  "receivedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP,
  "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  CONSTRAINT "InboundMessageDedup_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "InboundMessageDedup_provider_providerMessageId_idx" ON "InboundMessageDedup"("provider", "providerMessageId");
CREATE INDEX IF NOT EXISTS "InboundMessageDedup_conversationId_receivedAt_idx" ON "InboundMessageDedup"("conversationId", "receivedAt");
CREATE INDEX IF NOT EXISTS "InboundMessageDedup_processingStatus_receivedAt_idx" ON "InboundMessageDedup"("processingStatus", "receivedAt");

-- Create OutboundMessageLog table
CREATE TABLE IF NOT EXISTS "OutboundMessageLog" (
  "id" SERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "conversationId" INTEGER NOT NULL,
  "triggerProviderMessageId" TEXT,
  "outboundTextHash" TEXT NOT NULL,
  "outboundMessageId" INTEGER,
  "flowStep" TEXT,
  "lastQuestionKey" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundMessageLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
  CONSTRAINT "OutboundMessageLog_provider_triggerProviderMessageId_key" UNIQUE ("provider", "triggerProviderMessageId")
);

CREATE INDEX IF NOT EXISTS "OutboundMessageLog_conversationId_createdAt_idx" ON "OutboundMessageLog"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboundMessageLog_triggerProviderMessageId_idx" ON "OutboundMessageLog"("triggerProviderMessageId");
CREATE INDEX IF NOT EXISTS "OutboundMessageLog_flowStep_createdAt_idx" ON "OutboundMessageLog"("flowStep", "createdAt");

