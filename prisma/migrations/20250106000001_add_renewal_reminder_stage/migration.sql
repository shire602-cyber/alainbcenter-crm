-- Add reminder_stage and conversationId to Renewal
ALTER TABLE "Renewal" ADD COLUMN IF NOT EXISTS "reminderStage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Renewal" ADD COLUMN IF NOT EXISTS "conversationId" INTEGER;
ALTER TABLE "Renewal" ADD COLUMN IF NOT EXISTS "lastRemindedAt" TIMESTAMP(3);

-- Update status default to ACTIVE (was PENDING)
-- Note: Existing records with status='PENDING' should be updated to 'ACTIVE' if they're still active
ALTER TABLE "Renewal" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Update existing PENDING records to ACTIVE (if they're not expired)
UPDATE "Renewal" 
SET "status" = 'ACTIVE' 
WHERE "status" = 'PENDING' 
  AND "expiryDate" > NOW();

-- Add foreign key for conversationId (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Renewal_conversationId_fkey'
    ) THEN
        ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_conversationId_fkey" 
          FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Add channel and stage to RenewalNotification
-- Note: For existing records, we need to handle NOT NULL columns
DO $$ 
BEGIN
    -- Add channel column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'RenewalNotification' AND column_name = 'channel'
    ) THEN
        ALTER TABLE "RenewalNotification" ADD COLUMN "channel" TEXT DEFAULT 'whatsapp';
        -- Update existing records
        UPDATE "RenewalNotification" SET "channel" = 'whatsapp' WHERE "channel" IS NULL;
        -- Now make it NOT NULL
        ALTER TABLE "RenewalNotification" ALTER COLUMN "channel" SET NOT NULL;
        ALTER TABLE "RenewalNotification" ALTER COLUMN "channel" SET DEFAULT 'whatsapp';
    END IF;
    
    -- Add stage column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'RenewalNotification' AND column_name = 'stage'
    ) THEN
        ALTER TABLE "RenewalNotification" ADD COLUMN "stage" INTEGER DEFAULT 1;
        -- Update existing records (default to stage 1)
        UPDATE "RenewalNotification" SET "stage" = 1 WHERE "stage" IS NULL;
        -- Now make it NOT NULL
        ALTER TABLE "RenewalNotification" ALTER COLUMN "stage" SET NOT NULL;
        ALTER TABLE "RenewalNotification" ALTER COLUMN "stage" SET DEFAULT 1;
    END IF;
END $$;

-- Update idempotency key format (already unique, but update existing records if needed)
-- Note: Existing records will have old format, new records will use new format

-- Create indexes
CREATE INDEX IF NOT EXISTS "Renewal_status_reminderStage_nextReminderAt_idx" 
  ON "Renewal"("status", "reminderStage", "nextReminderAt");
CREATE INDEX IF NOT EXISTS "RenewalNotification_channel_renewalId_stage_idx" 
  ON "RenewalNotification"("channel", "renewalId", "stage");

