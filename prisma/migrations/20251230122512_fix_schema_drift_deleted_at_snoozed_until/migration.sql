-- Fix schema drift: Ensure Conversation.deletedAt and Notification.snoozedUntil exist
-- This migration is idempotent and safe to run multiple times

-- Add Conversation.deletedAt if missing
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Create index for deletedAt if missing (for inbox filtering)
CREATE INDEX IF NOT EXISTS "Conversation_deletedAt_idx" ON "Conversation"("deletedAt");

-- Add Notification.snoozedUntil if missing
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3);

-- Create index for snoozedUntil if missing
CREATE INDEX IF NOT EXISTS "Notification_snoozedUntil_idx" ON "Notification"("snoozedUntil");

