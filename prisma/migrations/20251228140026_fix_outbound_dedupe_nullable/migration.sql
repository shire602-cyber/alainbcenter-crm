-- Fix outboundDedupeKey to be nullable and handle existing null values
-- This migration fixes the schema mismatch and backfills existing rows

-- Step 1: Backfill existing rows with null outboundDedupeKey
UPDATE "OutboundMessageLog" 
SET "outboundDedupeKey" = 'legacy_' || id || '_' || "conversationId" || '_' || COALESCE("triggerProviderMessageId", 'none') || '_' || EXTRACT(EPOCH FROM "createdAt")::bigint
WHERE "outboundDedupeKey" IS NULL;

-- Step 2: Drop the old unique index if it exists
DROP INDEX IF EXISTS "OutboundMessageLog_outboundDedupeKey_key";

-- Step 3: Create partial unique index (allows multiple NULLs, enforces uniqueness for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundMessageLog_outboundDedupeKey_key" 
  ON "OutboundMessageLog"("outboundDedupeKey") 
  WHERE "outboundDedupeKey" IS NOT NULL;

