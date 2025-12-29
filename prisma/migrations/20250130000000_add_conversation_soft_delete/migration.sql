-- AlterTable
-- Check if column exists before adding (idempotent migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Conversation' AND column_name = 'deletedAt'
    ) THEN
        ALTER TABLE "Conversation" ADD COLUMN "deletedAt" TIMESTAMP(3);
    END IF;
END $$;
