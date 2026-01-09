-- AlterTable: meta_connections
-- Add new fields for tester token flow
ALTER TABLE "meta_connections" 
  ADD COLUMN IF NOT EXISTS "provider" TEXT DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS "meta_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "trigger_subscribed" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_error" TEXT;

-- Update status to use enum values
ALTER TABLE "meta_connections" 
  ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "meta_connections" 
  ALTER COLUMN "status" TYPE TEXT;
-- Set existing rows to 'connected' if they were 'active'
UPDATE "meta_connections" SET "status" = 'connected' WHERE "status" = 'active';
ALTER TABLE "meta_connections" 
  ALTER COLUMN "status" SET DEFAULT 'connected';

-- AlterTable: meta_webhook_events
-- Add connection_id foreign key
ALTER TABLE "meta_webhook_events" 
  ADD COLUMN IF NOT EXISTS "connection_id" INTEGER;

-- Add foreign key constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'meta_webhook_events_connection_id_fkey'
  ) THEN
    ALTER TABLE "meta_webhook_events" 
      ADD CONSTRAINT "meta_webhook_events_connection_id_fkey" 
      FOREIGN KEY ("connection_id") 
      REFERENCES "meta_connections"("id") 
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meta_connections_provider_idx" ON "meta_connections"("provider");
CREATE INDEX IF NOT EXISTS "meta_connections_meta_user_id_idx" ON "meta_connections"("meta_user_id");
CREATE INDEX IF NOT EXISTS "meta_webhook_events_connection_id_idx" ON "meta_webhook_events"("connection_id");

