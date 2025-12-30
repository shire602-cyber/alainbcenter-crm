-- AlterTable: Add new fields to OutboundJob for status tracking and AI content storage
ALTER TABLE "OutboundJob" 
  -- Add new status enum values support (keeping existing queued/running/done/failed, adding PENDING/GENERATING/READY_TO_SEND)
  -- Note: PostgreSQL doesn't enforce enum at DB level for String fields, so we just update the default
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  
  -- Add error log field for detailed error tracking
  ADD COLUMN IF NOT EXISTS "errorLog" TEXT,
  
  -- Add content field for AI-generated reply (stored before sending)
  ADD COLUMN IF NOT EXISTS "content" TEXT,
  
  -- Add last attempt timestamp (updated on every retry)
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  
  -- Add claimed_at for optimistic locking (prevents two workers processing same job)
  ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "OutboundJob_claimedAt_idx" ON "OutboundJob"("claimedAt");
CREATE INDEX IF NOT EXISTS "OutboundJob_status_claimedAt_idx" ON "OutboundJob"("status", "claimedAt");

-- Update existing jobs: Convert old status values to new enum
-- queued -> PENDING, running -> GENERATING, done -> SENT, failed -> FAILED
UPDATE "OutboundJob" SET "status" = 'PENDING' WHERE "status" = 'queued';
UPDATE "OutboundJob" SET "status" = 'GENERATING' WHERE "status" = 'running';
UPDATE "OutboundJob" SET "status" = 'SENT' WHERE "status" = 'done';
-- failed stays as FAILED (already matches)

