-- Migration: Add AutoReplyLog table
-- Run this on your production database

-- Create AutoReplyLog table
CREATE TABLE IF NOT EXISTS "AutoReplyLog" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "contactId" INTEGER,
    "messageId" INTEGER,
    "channel" TEXT NOT NULL,
    
    -- Inbound message details
    "inboundParsed" TEXT,
    "messageText" TEXT,
    
    -- Decision tracking
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "decision" TEXT NOT NULL,
    "decisionReason" TEXT,
    "skippedReason" TEXT,
    
    -- Retrieval results
    "retrievalDocsCount" INTEGER,
    "retrievalSimilarity" DOUBLE PRECISION,
    "retrievalReason" TEXT,
    "hasUsefulContext" BOOLEAN NOT NULL DEFAULT false,
    
    -- Reply details
    "replySent" BOOLEAN NOT NULL DEFAULT false,
    "replyText" TEXT,
    "replyStatus" TEXT,
    "replyError" TEXT,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    
    -- Human task
    "humanTaskCreated" BOOLEAN NOT NULL DEFAULT false,
    "humanTaskReason" TEXT,
    
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoReplyLog_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_leadId_fkey" 
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_conversationId_fkey" 
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_contactId_fkey" 
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_messageId_fkey" 
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS "AutoReplyLog_leadId_createdAt_idx" ON "AutoReplyLog"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutoReplyLog_conversationId_createdAt_idx" ON "AutoReplyLog"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutoReplyLog_contactId_createdAt_idx" ON "AutoReplyLog"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutoReplyLog_decision_createdAt_idx" ON "AutoReplyLog"("decision", "createdAt");
CREATE INDEX IF NOT EXISTS "AutoReplyLog_channel_createdAt_idx" ON "AutoReplyLog"("channel", "createdAt");

