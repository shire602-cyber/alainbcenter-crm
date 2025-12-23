-- EMERGENCY MIGRATION - Run this SQL directly in your database NOW
-- This will fix the "infoSharedAt does not exist" error immediately

-- Add the missing columns
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");

-- Verify (optional - check if columns were added)
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'Lead' 
AND column_name IN ('infoSharedAt', 'quotationSentAt', 'lastInfoSharedType');
