-- CRITICAL FIX: Add language field to Conversation for multilingual support
-- CRITICAL FIX: Add idempotencyKey to OutboundJob (if not already exists)
-- CRITICAL FIX: Add language/stage/serviceTypeId/serviceKey to AITrainingDocument (if not already exists)

-- Add language to Conversation
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Conversation' AND column_name='language') THEN
    ALTER TABLE "Conversation" ADD COLUMN "language" TEXT;
  END IF;
END $$;

-- Add idempotencyKey to OutboundJob (if not already exists)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OutboundJob' AND column_name='idempotencyKey') THEN
    ALTER TABLE "OutboundJob" ADD COLUMN "idempotencyKey" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "OutboundJob_idempotencyKey_key" ON "OutboundJob"("idempotencyKey");
    CREATE INDEX IF NOT EXISTS "OutboundJob_idempotencyKey_idx" ON "OutboundJob"("idempotencyKey");
  END IF;
END $$;

-- Add language to AITrainingDocument (if not already exists)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AITrainingDocument' AND column_name='language') THEN
    ALTER TABLE "AITrainingDocument" ADD COLUMN "language" TEXT;
  END IF;
END $$;

-- Add stage to AITrainingDocument (if not already exists)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AITrainingDocument' AND column_name='stage') THEN
    ALTER TABLE "AITrainingDocument" ADD COLUMN "stage" TEXT;
  END IF;
END $$;

-- Add serviceTypeId to AITrainingDocument (if not already exists)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AITrainingDocument' AND column_name='serviceTypeId') THEN
    ALTER TABLE "AITrainingDocument" ADD COLUMN "serviceTypeId" INTEGER;
  END IF;
END $$;

-- Add serviceKey to AITrainingDocument (if not already exists)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AITrainingDocument' AND column_name='serviceKey') THEN
    ALTER TABLE "AITrainingDocument" ADD COLUMN "serviceKey" TEXT;
  END IF;
END $$;

-- Create indexes for AITrainingDocument tags (if not already exist)
CREATE INDEX IF NOT EXISTS "AITrainingDocument_language_stage_idx" ON "AITrainingDocument"("language", "stage");
CREATE INDEX IF NOT EXISTS "AITrainingDocument_serviceKey_idx" ON "AITrainingDocument"("serviceKey");
CREATE INDEX IF NOT EXISTS "AITrainingDocument_serviceTypeId_idx" ON "AITrainingDocument"("serviceTypeId");










