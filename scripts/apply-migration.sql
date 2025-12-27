-- Add requestedServiceRaw to Lead model (PROBLEM B FIX)
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "requestedServiceRaw" TEXT;

-- Add lastAutoReplyKey to Conversation model (PROBLEM D FIX)
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastAutoReplyKey" TEXT;

-- Add aiStateJson to Conversation model (Reply Engine FSM state)
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "aiStateJson" TEXT;

