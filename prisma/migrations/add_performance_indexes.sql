-- Performance optimization indexes
-- Run this migration to add indexes for frequently queried fields

-- Lead indexes
CREATE INDEX IF NOT EXISTS "idx_lead_stage" ON "Lead"("stage");
CREATE INDEX IF NOT EXISTS "idx_lead_createdAt" ON "Lead"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_lead_expiryDate" ON "Lead"("expiryDate");
CREATE INDEX IF NOT EXISTS "idx_lead_assignedUserId" ON "Lead"("assignedUserId");
CREATE INDEX IF NOT EXISTS "idx_lead_nextFollowUpAt" ON "Lead"("nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "idx_lead_pipelineStage" ON "Lead"("pipelineStage");
CREATE INDEX IF NOT EXISTS "idx_lead_aiScore" ON "Lead"("aiScore");

-- Conversation indexes
CREATE INDEX IF NOT EXISTS "idx_conversation_lastMessageAt" ON "Conversation"("lastMessageAt");
CREATE INDEX IF NOT EXISTS "idx_conversation_channel" ON "Conversation"("channel");
CREATE INDEX IF NOT EXISTS "idx_conversation_status" ON "Conversation"("status");
CREATE INDEX IF NOT EXISTS "idx_conversation_contactId" ON "Conversation"("contactId");
CREATE INDEX IF NOT EXISTS "idx_conversation_leadId" ON "Conversation"("leadId");

-- ExpiryItem indexes (expiryDate is already in composite index, but add standalone for queries without status filter)
CREATE INDEX IF NOT EXISTS "idx_expiryItem_expiryDate" ON "ExpiryItem"("expiryDate");
CREATE INDEX IF NOT EXISTS "idx_expiryItem_leadId" ON "ExpiryItem"("leadId");
CREATE INDEX IF NOT EXISTS "idx_expiryItem_contactId" ON "ExpiryItem"("contactId");

-- Message indexes
CREATE INDEX IF NOT EXISTS "idx_message_createdAt" ON "Message"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_message_conversationId" ON "Message"("conversationId");
CREATE INDEX IF NOT EXISTS "idx_message_direction" ON "Message"("direction");

-- Task indexes
CREATE INDEX IF NOT EXISTS "idx_task_status" ON "Task"("status");
CREATE INDEX IF NOT EXISTS "idx_task_leadId" ON "Task"("leadId");
CREATE INDEX IF NOT EXISTS "idx_task_dueAt" ON "Task"("dueAt");

-- CommunicationLog indexes
CREATE INDEX IF NOT EXISTS "idx_communicationLog_createdAt" ON "CommunicationLog"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_communicationLog_leadId" ON "CommunicationLog"("leadId");

