-- Migration: Add AUTO-MATCH pipeline fields (additive only)
-- Adds fields for unified inbound message processing

-- Add dataJson to Lead
ALTER TABLE "Lead" 
  ADD COLUMN IF NOT EXISTS "dataJson" TEXT;

-- Create StaffSettings table
CREATE TABLE IF NOT EXISTS "StaffSettings" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL UNIQUE,
  "personalWhatsappNumber" TEXT,
  "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StaffSettings_userId_idx" ON "StaffSettings"("userId");

