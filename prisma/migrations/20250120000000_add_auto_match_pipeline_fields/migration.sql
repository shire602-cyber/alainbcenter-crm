-- Migration: Add AUTO-MATCH pipeline fields (PostgreSQL)
-- Adds fields for unified inbound message processing

-- Add dataJson to Lead
ALTER TABLE "Lead" 
  ADD COLUMN IF NOT EXISTS "dataJson" TEXT;

-- Create StaffSettings table
CREATE TABLE IF NOT EXISTS "StaffSettings" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE,
  "personalWhatsappNumber" TEXT,
  "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StaffSettings_userId_idx" ON "StaffSettings"("userId");

-- Add missing fields to Lead table (from lead cockpit)
ALTER TABLE "Lead" 
  ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOutboundAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "valueEstimate" TEXT;

-- Add missing fields to Document table
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "type" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'MISSING',
  ADD COLUMN IF NOT EXISTS "uploadedAt" TIMESTAMP(3);

-- Add missing fields to ExpiryItem table
ALTER TABLE "ExpiryItem"
  ADD COLUMN IF NOT EXISTS "remindersEnabled" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "stopRemindersAfterReply" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "nextReminderAt" TIMESTAMP(3);

-- Update default renewalStatus if needed
UPDATE "ExpiryItem" SET "renewalStatus" = 'NOT_STARTED' WHERE "renewalStatus" = 'PENDING';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "ExpiryItem_leadId_expiryDate_idx" ON "ExpiryItem"("leadId", "expiryDate");
CREATE INDEX IF NOT EXISTS "Document_status_idx" ON "Document"("status");
CREATE INDEX IF NOT EXISTS "Document_type_idx" ON "Document"("type");

