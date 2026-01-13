-- Add Instagram username and user ID fields to Contact table
-- These fields store Instagram identity information for proper display and routing

ALTER TABLE "Contact" 
ADD COLUMN IF NOT EXISTS "ig_username" TEXT,
ADD COLUMN IF NOT EXISTS "ig_user_id" TEXT;

-- Add index on ig_user_id for faster lookups
CREATE INDEX IF NOT EXISTS "Contact_ig_user_id_idx" ON "Contact"("ig_user_id");

-- Add comment
COMMENT ON COLUMN "Contact"."ig_username" IS 'Instagram username (e.g., "john_doe")';
COMMENT ON COLUMN "Contact"."ig_user_id" IS 'Instagram numeric ID (e.g., "6221774837922501")';
