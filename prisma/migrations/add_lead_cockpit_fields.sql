-- Migration: Add Lead Cockpit fields (additive only, no breaking changes)
-- Adds fields for premium lead management UI

-- Add missing fields to Lead table
ALTER TABLE "Lead" 
  ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lastOutboundAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "valueEstimate" TEXT;

-- Add missing fields to Document table
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "type" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'MISSING',
  ADD COLUMN IF NOT EXISTS "uploadedAt" TIMESTAMP;

-- Add missing fields to ExpiryItem table
ALTER TABLE "ExpiryItem"
  ADD COLUMN IF NOT EXISTS "remindersEnabled" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "stopRemindersAfterReply" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "nextReminderAt" TIMESTAMP;

-- Update default renewalStatus if needed
UPDATE "ExpiryItem" SET "renewalStatus" = 'NOT_STARTED' WHERE "renewalStatus" = 'PENDING';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "ExpiryItem_leadId_expiryDate_idx" ON "ExpiryItem"("leadId", "expiryDate");
CREATE INDEX IF NOT EXISTS "Document_status_idx" ON "Document"("status");
CREATE INDEX IF NOT EXISTS "Document_type_idx" ON "Document"("type");

