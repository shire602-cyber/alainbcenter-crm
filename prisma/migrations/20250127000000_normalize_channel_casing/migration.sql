-- Normalize channel casing to lowercase
-- This prevents duplicate conversations due to case mismatches

-- Update Conversation.channel to lowercase
UPDATE "Conversation" 
SET channel = LOWER(channel)
WHERE channel != LOWER(channel);

-- Update Message.channel to lowercase
UPDATE "Message" 
SET channel = LOWER(channel)
WHERE channel != LOWER(channel);

-- Update CommunicationLog.channel to lowercase
UPDATE "CommunicationLog" 
SET channel = LOWER(channel)
WHERE channel != LOWER(channel);

-- Update InboundMessageDedup.provider to lowercase
UPDATE "InboundMessageDedup" 
SET provider = LOWER(provider)
WHERE provider != LOWER(provider);

-- Update OutboundMessageLog.provider to lowercase
UPDATE "OutboundMessageLog" 
SET provider = LOWER(provider)
WHERE provider != LOWER(provider);

-- Verify unique constraint works (should not throw if no duplicates)
-- If duplicates exist, they will need to be resolved by repair script first


