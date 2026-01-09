-- CreateEnum
CREATE TYPE "RenewalServiceType" AS ENUM ('TRADE_LICENSE', 'EMIRATES_ID', 'RESIDENCY', 'VISIT_VISA', 'CHANGE_STATUS');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('UPCOMING', 'ACTION_REQUIRED', 'URGENT', 'EXPIRED', 'CONTACTED', 'QUOTED', 'IN_PROGRESS', 'RENEWED', 'LOST');

-- CreateEnum
CREATE TYPE "RenewalEventType" AS ENUM ('CONTACTED', 'TEMPLATE_SENT', 'QUOTED', 'PAID', 'RENEWED', 'LOST', 'NOTE', 'AUTO_RULE_RUN');

-- CreateTable
CREATE TABLE "RenewalItem" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "contactId" INTEGER,
    "serviceType" "RenewalServiceType" NOT NULL,
    "serviceName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RenewalStatus" NOT NULL DEFAULT 'UPCOMING',
    "expectedValue" INTEGER,
    "probability" INTEGER NOT NULL DEFAULT 70,
    "assignedToUserId" INTEGER,
    "lastContactedAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "lastTemplateName" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "RenewalEventLog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "renewalItemId" INTEGER NOT NULL,
    "type" "RenewalEventType" NOT NULL,
    "channel" TEXT,
    "messageId" INTEGER,
    "payload" JSONB,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "RenewalItem_expiresAt_idx" ON "RenewalItem"("expiresAt");

-- CreateIndex
CREATE INDEX "RenewalItem_status_expiresAt_idx" ON "RenewalItem"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "RenewalItem_leadId_idx" ON "RenewalItem"("leadId");

-- CreateIndex
CREATE INDEX "RenewalItem_assignedToUserId_status_expiresAt_idx" ON "RenewalItem"("assignedToUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "RenewalEventLog_renewalItemId_createdAt_idx" ON "RenewalEventLog"("renewalItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "RenewalItem" ADD CONSTRAINT "RenewalItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalItem" ADD CONSTRAINT "RenewalItem_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalEventLog" ADD CONSTRAINT "RenewalEventLog_renewalItemId_fkey" FOREIGN KEY ("renewalItemId") REFERENCES "RenewalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalEventLog" ADD CONSTRAINT "RenewalEventLog_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

