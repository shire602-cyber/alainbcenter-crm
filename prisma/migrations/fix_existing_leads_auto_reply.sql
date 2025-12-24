-- Fix existing leads: Set autoReplyEnabled = true for leads where it's NULL
-- This ensures leads created before the migration have auto-reply enabled

UPDATE "Lead" 
SET "autoReplyEnabled" = true 
WHERE "autoReplyEnabled" IS NULL;

