-- CreateTable
CREATE TABLE "OutboundJob" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "inboundMessageId" INTEGER,
    "inboundProviderMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OutboundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundJob_inboundProviderMessageId_key" ON "OutboundJob"("inboundProviderMessageId");

-- CreateIndex
CREATE INDEX "OutboundJob_status_runAt_idx" ON "OutboundJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "OutboundJob_conversationId_createdAt_idx" ON "OutboundJob"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundJob_requestId_idx" ON "OutboundJob"("requestId");

-- AddForeignKey
ALTER TABLE "OutboundJob" ADD CONSTRAINT "OutboundJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundJob" ADD CONSTRAINT "OutboundJob_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

