-- Migration: Add info/quotation sharing tracking fields to Lead table
-- Phase 2: Info/Quotation Sharing Detection

-- Add new columns to Lead table
ALTER TABLE "Lead" ADD COLUMN "infoSharedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "quotationSentAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "lastInfoSharedType" TEXT;

-- Create index for efficient querying of info shared leads
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
