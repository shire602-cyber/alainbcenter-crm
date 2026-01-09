-- CreateTable
CREATE TABLE "Renewal" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "serviceType" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastNotifiedAt" TIMESTAMP(3),
    "nextReminderAt" TIMESTAMP(3),
    "reminderSchedule" TEXT NOT NULL DEFAULT '[30,14,7,1]',
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Renewal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalNotification" (
    "id" SERIAL NOT NULL,
    "renewalId" INTEGER NOT NULL,
    "templateName" TEXT NOT NULL,
    "reminderDate" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenewalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RenewalNotification_idempotencyKey_key" ON "RenewalNotification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Renewal_contactId_expiryDate_idx" ON "Renewal"("contactId", "expiryDate");

-- CreateIndex
CREATE INDEX "Renewal_nextReminderAt_idx" ON "Renewal"("nextReminderAt");

-- CreateIndex
CREATE INDEX "Renewal_status_nextReminderAt_idx" ON "Renewal"("status", "nextReminderAt");

-- CreateIndex
CREATE INDEX "RenewalNotification_renewalId_reminderDate_idx" ON "RenewalNotification"("renewalId", "reminderDate");

-- CreateIndex
CREATE INDEX "RenewalNotification_idempotencyKey_idx" ON "RenewalNotification"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalNotification" ADD CONSTRAINT "RenewalNotification_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "Renewal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

