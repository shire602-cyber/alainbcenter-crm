-- AlterTable: Add serviceOtherDescription field
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "serviceOtherDescription" TEXT;
