-- Add state machine fields to Conversation table
-- These fields enable fail-proof deduplication and strict question management

ALTER TABLE "Conversation" 
ADD COLUMN IF NOT EXISTS "stateVersion" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastAssistantMessageAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "qualificationStage" TEXT,
ADD COLUMN IF NOT EXISTS "questionsAskedCount" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "knownFields" TEXT;

-- Create index for state version queries
CREATE INDEX IF NOT EXISTS "Conversation_stateVersion_idx" ON "Conversation"("stateVersion");

