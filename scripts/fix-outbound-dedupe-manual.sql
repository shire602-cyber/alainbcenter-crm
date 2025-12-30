-- MANUAL FIX SCRIPT for outboundDedupeKey null values
-- Run this directly in your database to fix existing null values
-- 
-- Usage:
--   psql $DATABASE_URL -f scripts/fix-outbound-dedupe-manual.sql
--   OR copy/paste into your database admin tool

-- Step 1: Backfill existing rows with null outboundDedupeKey
UPDATE "OutboundMessageLog" 
SET "outboundDedupeKey" = 'legacy_' || id || '_' || "conversationId" || '_' || COALESCE("triggerProviderMessageId", 'none') || '_' || EXTRACT(EPOCH FROM "createdAt")::bigint
WHERE "outboundDedupeKey" IS NULL;

-- Step 2: Drop the old unique index if it exists (if it doesn't allow nulls)
DROP INDEX IF EXISTS "OutboundMessageLog_outboundDedupeKey_key";

-- Step 3: Create partial unique index (allows multiple NULLs, enforces uniqueness for non-null values)
-- This is PostgreSQL's way of handling unique nullable columns
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundMessageLog_outboundDedupeKey_key" 
  ON "OutboundMessageLog"("outboundDedupeKey") 
  WHERE "outboundDedupeKey" IS NOT NULL;

-- Verify: Check that all rows now have outboundDedupeKey
SELECT 
  COUNT(*) as total_rows,
  COUNT("outboundDedupeKey") as rows_with_key,
  COUNT(*) - COUNT("outboundDedupeKey") as rows_without_key
FROM "OutboundMessageLog";


