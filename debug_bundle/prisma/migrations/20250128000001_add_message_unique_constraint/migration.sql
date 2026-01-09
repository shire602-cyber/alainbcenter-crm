-- Add unique constraint on Message (channel, providerMessageId)
-- This prevents duplicate messages when webhooks retry

-- First, remove any existing duplicates (keep the first one)
DELETE FROM "Message" m1
WHERE EXISTS (
  SELECT 1 FROM "Message" m2
  WHERE m2.id < m1.id
    AND LOWER(m2.channel) = LOWER(m1.channel)
    AND m2."providerMessageId" = m1."providerMessageId"
    AND m2."providerMessageId" IS NOT NULL
);

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "Message_channel_providerMessageId_key" 
ON "Message" (LOWER(channel), "providerMessageId") 
WHERE "providerMessageId" IS NOT NULL;

