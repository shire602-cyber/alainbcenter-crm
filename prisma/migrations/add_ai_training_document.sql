-- Add AITrainingDocument table for PostgreSQL
-- This migration adds the AI Training Document table that was missing

CREATE TABLE IF NOT EXISTS "AITrainingDocument" (
    "id" SERIAL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AITrainingDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "AITrainingDocument_type_idx" ON "AITrainingDocument"("type");
CREATE INDEX IF NOT EXISTS "AITrainingDocument_createdAt_idx" ON "AITrainingDocument"("createdAt");

