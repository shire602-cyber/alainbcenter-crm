-- AlterTable: Add key, enabled, schedule, template fields to AutomationRule
ALTER TABLE "AutomationRule" ADD COLUMN "key" TEXT;
ALTER TABLE "AutomationRule" ADD COLUMN "enabled" BOOLEAN DEFAULT true;
ALTER TABLE "AutomationRule" ADD COLUMN "schedule" TEXT DEFAULT 'daily';
ALTER TABLE "AutomationRule" ADD COLUMN "template" TEXT;

-- Create unique index on key
CREATE UNIQUE INDEX "AutomationRule_key_key" ON "AutomationRule"("key");

-- AlterTable: Update AutomationRunLog structure
-- First, add new columns
ALTER TABLE "AutomationRunLog" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "AutomationRunLog" ADD COLUMN "ruleKey" TEXT;
ALTER TABLE "AutomationRunLog" ADD COLUMN "contactId" INTEGER;
ALTER TABLE "AutomationRunLog" ADD COLUMN "status" TEXT;
ALTER TABLE "AutomationRunLog" ADD COLUMN "reason" TEXT;
ALTER TABLE "AutomationRunLog" ADD COLUMN "message" TEXT;
ALTER TABLE "AutomationRunLog" ADD COLUMN "meta" TEXT;

-- Create unique index on idempotencyKey
CREATE UNIQUE INDEX "AutomationRunLog_idempotencyKey_key" ON "AutomationRunLog"("idempotencyKey");

-- Create indexes
CREATE INDEX "AutomationRunLog_ruleKey_leadId_createdAt_idx" ON "AutomationRunLog"("ruleKey", "leadId", "createdAt");
CREATE INDEX "AutomationRunLog_status_createdAt_idx" ON "AutomationRunLog"("status", "createdAt");






















