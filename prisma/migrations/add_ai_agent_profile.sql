-- Add AIAgentProfile table and update Lead table for PostgreSQL
-- This migration adds the AI Agent Profile system for managing different AI agents

-- Create AIAgentProfile table
CREATE TABLE IF NOT EXISTS "AIAgentProfile" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "trainingDocumentIds" TEXT,
    "systemPrompt" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "maxMessageLength" INTEGER NOT NULL DEFAULT 300,
    "maxTotalLength" INTEGER NOT NULL DEFAULT 600,
    "maxQuestionsPerMessage" INTEGER NOT NULL DEFAULT 2,
    "allowedPhrases" TEXT,
    "prohibitedPhrases" TEXT,
    "customGreeting" TEXT,
    "customSignoff" TEXT,
    "responseDelayMin" INTEGER NOT NULL DEFAULT 0,
    "responseDelayMax" INTEGER NOT NULL DEFAULT 5,
    "rateLimitMinutes" INTEGER NOT NULL DEFAULT 2,
    "businessHoursStart" TEXT NOT NULL DEFAULT '07:00',
    "businessHoursEnd" TEXT NOT NULL DEFAULT '21:30',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "allowOutsideHours" BOOLEAN NOT NULL DEFAULT false,
    "firstMessageImmediate" BOOLEAN NOT NULL DEFAULT true,
    "similarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "confidenceThreshold" INTEGER NOT NULL DEFAULT 50,
    "escalateToHumanRules" TEXT,
    "skipAutoReplyRules" TEXT,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "autoDetectLanguage" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "AIAgentProfile_isActive_isDefault_idx" ON "AIAgentProfile"("isActive", "isDefault");
CREATE INDEX IF NOT EXISTS "AIAgentProfile_name_idx" ON "AIAgentProfile"("name");

-- Add aiAgentProfileId to Lead table
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "aiAgentProfileId" INTEGER;

-- Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Lead_aiAgentProfileId_fkey'
    ) THEN
        ALTER TABLE "Lead" 
        ADD CONSTRAINT "Lead_aiAgentProfileId_fkey" 
        FOREIGN KEY ("aiAgentProfileId") 
        REFERENCES "AIAgentProfile"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Create index on Lead.aiAgentProfileId
CREATE INDEX IF NOT EXISTS "Lead_aiAgentProfileId_idx" ON "Lead"("aiAgentProfileId");

-- Create default agents
INSERT INTO "AIAgentProfile" ("name", "description", "isActive", "isDefault", "tone", "maxMessageLength", "maxTotalLength", "maxQuestionsPerMessage", "rateLimitMinutes", "businessHoursStart", "businessHoursEnd", "timezone", "allowOutsideHours", "firstMessageImmediate", "similarityThreshold", "confidenceThreshold", "defaultLanguage", "autoDetectLanguage")
VALUES 
    ('Sales Agent', 'Handles new inquiries and sales conversations. Focuses on qualification and conversion.', true, true, 'friendly', 300, 600, 2, 2, '07:00', '21:30', 'Asia/Dubai', false, true, 0.7, 50, 'en', true),
    ('Customer Support Agent', 'Handles existing customer support requests. More patient and solution-focused.', true, false, 'professional', 400, 800, 2, 3, '07:00', '21:30', 'Asia/Dubai', false, true, 0.7, 50, 'en', true),
    ('Follow-up Agent', 'Handles follow-ups and reminders. Gentle and non-pushy approach.', true, false, 'friendly', 250, 500, 1, 5, '07:00', '21:30', 'Asia/Dubai', false, true, 0.7, 50, 'en', true)
ON CONFLICT ("name") DO NOTHING;

