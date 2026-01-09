-- Add description and priority to Task
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'MEDIUM';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastNudgedAt" TIMESTAMP(3);

-- Create TaskAssignee table (many-to-many)
CREATE TABLE IF NOT EXISTS "TaskAssignee" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create unique constraint and indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignee_taskId_userId_key" ON "TaskAssignee"("taskId", "userId");
CREATE INDEX IF NOT EXISTS "TaskAssignee_userId_taskId_idx" ON "TaskAssignee"("userId", "taskId");
CREATE INDEX IF NOT EXISTS "TaskAssignee_taskId_idx" ON "TaskAssignee"("taskId");

-- Add indexes to Task
CREATE INDEX IF NOT EXISTS "Task_status_dueAt_idx" ON "Task"("status", "dueAt");
CREATE INDEX IF NOT EXISTS "Task_priority_dueAt_idx" ON "Task"("priority", "dueAt");

-- Update Notification to support tasks
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "taskId" INTEGER;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

-- Add foreign key and indexes for task notifications
-- Use DO block to safely add constraint only if it doesn't exist (PostgreSQL-specific)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Notification_taskId_fkey'
    ) THEN
        ALTER TABLE "Notification" 
        ADD CONSTRAINT "Notification_taskId_fkey" 
        FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Notification_taskId_idx" ON "Notification"("taskId");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
