-- Add ruleEngineMemory field to Conversation table
-- This stores JSON conversation memory (name, service, nationality, etc.) for the deterministic rule engine

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "ruleEngineMemory" TEXT;

