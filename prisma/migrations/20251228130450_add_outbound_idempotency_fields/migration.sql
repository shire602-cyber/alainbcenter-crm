-- Add outbound idempotency fields to OutboundMessageLog
-- This enables hard idempotency guarantees across multiple server instances

ALTER TABLE "OutboundMessageLog" 
ADD COLUMN IF NOT EXISTS "outboundDedupeKey" TEXT,
ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "error" TEXT,
ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
ADD COLUMN IF NOT EXISTS "replyType" TEXT,
ADD COLUMN IF NOT EXISTS "dayBucket" TEXT,
ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP;

-- Create unique constraint on outboundDedupeKey (hard idempotency)
-- Use partial unique index to allow multiple NULLs (PostgreSQL behavior)
-- This ensures uniqueness for non-null values while allowing legacy rows to coexist
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundMessageLog_outboundDedupeKey_key" 
  ON "OutboundMessageLog"("outboundDedupeKey") 
  WHERE "outboundDedupeKey" IS NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "OutboundMessageLog_status_createdAt_idx" ON "OutboundMessageLog"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboundMessageLog_outboundDedupeKey_idx" ON "OutboundMessageLog"("outboundDedupeKey");

-- Update existing rows to have status='SENT' (assume they were sent)
UPDATE "OutboundMessageLog" SET "status" = 'SENT' WHERE "status" IS NULL;

-- Backfill outboundDedupeKey for existing rows (generate a unique key based on existing data)
-- This allows existing rows to coexist with the unique constraint
UPDATE "OutboundMessageLog" 
SET "outboundDedupeKey" = 'legacy_' || id || '_' || "conversationId" || '_' || COALESCE("triggerProviderMessageId", 'none') || '_' || EXTRACT(EPOCH FROM "createdAt")::bigint
WHERE "outboundDedupeKey" IS NULL;

