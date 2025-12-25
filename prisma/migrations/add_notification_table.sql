-- Add Notification table for PostgreSQL
-- This migration adds the Notification table that was missing

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "leadId" INTEGER,
    "conversationId" INTEGER,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "Notification_isRead_createdAt_idx" ON "Notification"("isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_leadId_idx" ON "Notification"("leadId");
CREATE INDEX IF NOT EXISTS "Notification_conversationId_idx" ON "Notification"("conversationId");
CREATE INDEX IF NOT EXISTS "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

