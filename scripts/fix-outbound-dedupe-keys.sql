-- Fix script for outboundDedupeKey null values
-- Run this if you have existing OutboundMessageLog rows with null outboundDedupeKey

-- Step 1: Backfill existing rows with a generated key
UPDATE "OutboundMessageLog" 
SET "outboundDedupeKey" = 'legacy_' || id || '_' || "conversationId" || '_' || COALESCE("triggerProviderMessageId", 'none') || '_' || EXTRACT(EPOCH FROM "createdAt")::bigint
WHERE "outboundDedupeKey" IS NULL;

-- Step 2: Drop and recreate the unique index to allow nulls
DROP INDEX IF EXISTS "OutboundMessageLog_outboundDedupeKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundMessageLog_outboundDedupeKey_key" 
  ON "OutboundMessageLog"("outboundDedupeKey") 
  WHERE "outboundDedupeKey" IS NOT NULL;

