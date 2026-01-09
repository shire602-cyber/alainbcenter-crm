-- Add index for externalThreadId uniqueness
-- This supports the upsertConversation logic that uses (channel, contactId, externalThreadId)

CREATE INDEX IF NOT EXISTS "Conversation_channel_contactId_externalThreadId_idx" 
ON "Conversation" (channel, "contactId", "externalThreadId") 
WHERE "externalThreadId" IS NOT NULL;


