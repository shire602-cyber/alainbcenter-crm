-- PostgreSQL version of performance indexes
-- Run this on your Neon database after migrations

-- Lead table indexes
CREATE INDEX IF NOT EXISTS "Lead_stage_idx" ON "Lead" ("stage");
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx" ON "Lead" ("createdAt");
CREATE INDEX IF NOT EXISTS "Lead_expiryDate_idx" ON "Lead" ("expiryDate");
CREATE INDEX IF NOT EXISTS "Lead_assignedUserId_idx" ON "Lead" ("assignedUserId");
CREATE INDEX IF NOT EXISTS "Lead_nextFollowUpAt_idx" ON "Lead" ("nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "Lead_pipelineStage_idx" ON "Lead" ("pipelineStage");
CREATE INDEX IF NOT EXISTS "Lead_aiScore_idx" ON "Lead" ("aiScore");
CREATE INDEX IF NOT EXISTS "Lead_lastContactChannel_idx" ON "Lead" ("lastContactChannel");
CREATE INDEX IF NOT EXISTS "Lead_serviceTypeEnum_idx" ON "Lead" ("serviceTypeEnum");
CREATE INDEX IF NOT EXISTS "Lead_updatedAt_idx" ON "Lead" ("updatedAt");

-- Conversation table indexes
CREATE INDEX IF NOT EXISTS "Conversation_lastMessageAt_idx" ON "Conversation" ("lastMessageAt");
CREATE INDEX IF NOT EXISTS "Conversation_channel_idx" ON "Conversation" ("channel");
CREATE INDEX IF NOT EXISTS "Conversation_status_idx" ON "Conversation" ("status");
CREATE INDEX IF NOT EXISTS "Conversation_contactId_idx" ON "Conversation" ("contactId");
CREATE INDEX IF NOT EXISTS "Conversation_leadId_idx" ON "Conversation" ("leadId");

-- ExpiryItem table indexes
CREATE INDEX IF NOT EXISTS "ExpiryItem_expiryDate_idx" ON "ExpiryItem" ("expiryDate");
CREATE INDEX IF NOT EXISTS "ExpiryItem_leadId_idx" ON "ExpiryItem" ("leadId");
CREATE INDEX IF NOT EXISTS "ExpiryItem_contactId_idx" ON "ExpiryItem" ("contactId");
CREATE INDEX IF NOT EXISTS "ExpiryItem_renewalStatus_idx" ON "ExpiryItem" ("renewalStatus");

-- Message table indexes
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message" ("createdAt");
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message" ("conversationId");
CREATE INDEX IF NOT EXISTS "Message_direction_idx" ON "Message" ("direction");

-- Task table indexes
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task" ("status");
CREATE INDEX IF NOT EXISTS "Task_leadId_idx" ON "Task" ("leadId");
CREATE INDEX IF NOT EXISTS "Task_dueAt_idx" ON "Task" ("dueAt");

-- CommunicationLog table indexes
CREATE INDEX IF NOT EXISTS "CommunicationLog_createdAt_idx" ON "CommunicationLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "CommunicationLog_leadId_idx" ON "CommunicationLog" ("leadId");


