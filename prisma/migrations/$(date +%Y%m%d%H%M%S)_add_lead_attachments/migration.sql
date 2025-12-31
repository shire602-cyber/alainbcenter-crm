-- CreateTable: LeadAttachment
CREATE TABLE IF NOT EXISTS "LeadAttachment" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "messageId" INTEGER,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "thumbnailUrl" TEXT,
    "durationSec" INTEGER,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storagePath" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadAttachment_leadId_createdAt_idx" ON "LeadAttachment"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadAttachment_conversationId_idx" ON "LeadAttachment"("conversationId");
CREATE INDEX IF NOT EXISTS "LeadAttachment_messageId_idx" ON "LeadAttachment"("messageId");
CREATE INDEX IF NOT EXISTS "LeadAttachment_type_idx" ON "LeadAttachment"("type");

-- AddForeignKey
ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

