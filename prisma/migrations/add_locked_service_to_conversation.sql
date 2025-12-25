-- Add lockedService column to Conversation table
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lockedService" TEXT;

