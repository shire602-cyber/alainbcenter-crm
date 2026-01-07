-- Redesign Renewal Model - Phase A
-- Create new RenewalType and RenewalStatus enums
-- Update Renewal model to be first-class, linked to Lead
-- Rename existing RenewalStatus to RenewalItemStatus for RenewalItem

-- Step 1: Rename existing RenewalStatus enum to RenewalItemStatus (for RenewalItem model)
ALTER TYPE "RenewalStatus" RENAME TO "RenewalItemStatus";

-- Step 2: Create new RenewalType enum
CREATE TYPE "RenewalType" AS ENUM ('TRADE_LICENSE', 'EMIRATES_ID', 'RESIDENCY', 'VISIT_VISA');

-- Step 3: Create new RenewalStatus enum (for Renewal model)
CREATE TYPE "RenewalStatus" AS ENUM ('ACTIVE', 'CONTACTED', 'IN_PROGRESS', 'RENEWED', 'EXPIRED', 'LOST');

-- Step 4: Update RenewalItem to use RenewalItemStatus
ALTER TABLE "RenewalItem" ALTER COLUMN "status" TYPE "RenewalItemStatus" USING "status"::text::"RenewalItemStatus";

-- Step 5: Drop old Renewal table columns and recreate with new structure
-- First, drop foreign key constraints
ALTER TABLE "RenewalNotification" DROP CONSTRAINT IF EXISTS "RenewalNotification_renewalId_fkey";
ALTER TABLE "Renewal" DROP CONSTRAINT IF EXISTS "Renewal_contactId_fkey";
ALTER TABLE "Renewal" DROP CONSTRAINT IF EXISTS "Renewal_leadId_fkey";
ALTER TABLE "Renewal" DROP CONSTRAINT IF EXISTS "Renewal_conversationId_fkey";
ALTER TABLE "Renewal" DROP CONSTRAINT IF EXISTS "Renewal_assignedUserId_fkey";

-- Step 6: Drop old columns from Renewal
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "contactId";
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "conversationId";
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "serviceType";
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "reminderStage";
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "lastNotifiedAt";
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "lastRemindedAt";
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "nextReminderAt";
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "reminderSchedule";
ALTER TABLE "Renewal" DROP COLUMN IF EXISTS "remindersEnabled";

-- Step 7: Add new columns to Renewal
ALTER TABLE "Renewal" 
  ADD COLUMN IF NOT EXISTS "type" "RenewalType",
  ADD COLUMN IF NOT EXISTS "estimatedValue" INTEGER,
  ADD COLUMN IF NOT EXISTS "assignedUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastContactedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextFollowUpAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Step 8: Update status column to use new RenewalStatus enum
ALTER TABLE "Renewal" ALTER COLUMN "status" TYPE "RenewalStatus" USING 
  CASE 
    WHEN "status"::text = 'ACTIVE' THEN 'ACTIVE'::"RenewalStatus"
    WHEN "status"::text = 'RENEWED' THEN 'RENEWED'::"RenewalStatus"
    WHEN "status"::text = 'CANCELLED' THEN 'LOST'::"RenewalStatus"
    WHEN "status"::text = 'EXPIRED' THEN 'EXPIRED'::"RenewalStatus"
    ELSE 'ACTIVE'::"RenewalStatus"
  END;

-- Step 9: Set default status
ALTER TABLE "Renewal" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"RenewalStatus";

-- Step 10: Make leadId required (not nullable)
ALTER TABLE "Renewal" ALTER COLUMN "leadId" SET NOT NULL;

-- Step 11: Add foreign key constraints
ALTER TABLE "Renewal" 
  ADD CONSTRAINT "Renewal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Renewal_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 12: Recreate indexes
DROP INDEX IF EXISTS "Renewal_contactId_expiryDate_idx";
DROP INDEX IF EXISTS "Renewal_nextReminderAt_idx";
DROP INDEX IF EXISTS "Renewal_status_nextReminderAt_idx";
DROP INDEX IF EXISTS "Renewal_status_reminderStage_nextReminderAt_idx";

CREATE INDEX IF NOT EXISTS "Renewal_leadId_expiryDate_idx" ON "Renewal"("leadId", "expiryDate");
CREATE INDEX IF NOT EXISTS "Renewal_status_expiryDate_idx" ON "Renewal"("status", "expiryDate");
CREATE INDEX IF NOT EXISTS "Renewal_assignedUserId_status_expiryDate_idx" ON "Renewal"("assignedUserId", "status", "expiryDate");
CREATE INDEX IF NOT EXISTS "Renewal_expiryDate_idx" ON "Renewal"("expiryDate");

-- Step 13: Update RenewalNotification foreign key
ALTER TABLE "RenewalNotification" 
  ADD CONSTRAINT "RenewalNotification_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "Renewal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

