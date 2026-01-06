-- Add providerMediaId and related media fields to Message table
-- This enables deterministic media fetching from WhatsApp Graph API

-- Add new fields
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "providerMediaId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaFilename" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaSize" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaSha256" TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "Message_providerMediaId_idx" ON "Message"("providerMediaId");

-- Migrate existing data: If mediaUrl exists and looks like a media ID (numeric, not a URL), copy to providerMediaId
-- This handles legacy data where mediaUrl was used to store the media ID
UPDATE "Message"
SET "providerMediaId" = "mediaUrl"
WHERE "mediaUrl" IS NOT NULL
  AND "mediaUrl" != ''
  AND "mediaUrl" NOT LIKE 'http%'
  AND "mediaUrl" NOT LIKE '/%'
  AND "mediaUrl" ~ '^[0-9]+$'
  AND "providerMediaId" IS NULL;








