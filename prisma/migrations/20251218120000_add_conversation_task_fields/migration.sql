-- AlterTable: Add conversation tracking fields
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastOutboundAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "needsReplySince" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "slaBreachAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "priorityScore" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Conversation_assignedUserId_lastMessageAt_idx" ON "Conversation"("assignedUserId", "lastMessageAt");

-- AlterTable: Add task fields
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "conversationId" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Task_idempotencyKey_key" ON "Task"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Task_conversationId_idx" ON "Task"("conversationId");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Task_conversationId_fkey'
    ) THEN
        ALTER TABLE "Task" ADD CONSTRAINT "Task_conversationId_fkey" 
        FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
