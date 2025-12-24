-- Migration: Add auto-reply fields and Reminder model
-- Run this on your production database (Vercel Postgres)

-- Add auto-reply fields to Lead table
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "autoReplyMode" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "mutedUntil" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastAutoReplyAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "allowOutsideHours" BOOLEAN NOT NULL DEFAULT false;

-- Create Reminder table
CREATE TABLE IF NOT EXISTS "Reminder" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "templateKey" TEXT,
    "message" TEXT,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- Add foreign key
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS "Reminder_leadId_scheduledAt_idx" ON "Reminder"("leadId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Reminder_sent_scheduledAt_idx" ON "Reminder"("sent", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Reminder_type_scheduledAt_idx" ON "Reminder"("type", "scheduledAt");

