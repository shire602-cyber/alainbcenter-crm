-- Add lastAiOutboundAt to Conversation for cooldown tracking
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastAiOutboundAt" TIMESTAMP(3);

-- Create OutboundMessageDedup table for provider-level deduplication
CREATE TABLE IF NOT EXISTS "OutboundMessageDedup" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "inboundProviderMessageId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,

    CONSTRAINT "OutboundMessageDedup_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on dedupeKey
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundMessageDedup_dedupeKey_key" ON "OutboundMessageDedup"("dedupeKey");

-- Create indexes
CREATE INDEX IF NOT EXISTS "OutboundMessageDedup_conversationId_createdAt_idx" ON "OutboundMessageDedup"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboundMessageDedup_inboundProviderMessageId_idx" ON "OutboundMessageDedup"("inboundProviderMessageId");
CREATE INDEX IF NOT EXISTS "OutboundMessageDedup_status_createdAt_idx" ON "OutboundMessageDedup"("status", "createdAt");

-- Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'OutboundMessageDedup_conversationId_fkey'
    ) THEN
        ALTER TABLE "OutboundMessageDedup" ADD CONSTRAINT "OutboundMessageDedup_conversationId_fkey" 
          FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

