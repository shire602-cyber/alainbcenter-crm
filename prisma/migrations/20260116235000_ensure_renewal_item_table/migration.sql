-- Ensure enums exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RenewalServiceType') THEN
    CREATE TYPE "RenewalServiceType" AS ENUM ('TRADE_LICENSE', 'EMIRATES_ID', 'RESIDENCY', 'VISIT_VISA', 'CHANGE_STATUS');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RenewalItemStatus') THEN
    CREATE TYPE "RenewalItemStatus" AS ENUM ('UPCOMING', 'ACTION_REQUIRED', 'URGENT', 'EXPIRED', 'CONTACTED', 'QUOTED', 'IN_PROGRESS', 'RENEWED', 'LOST');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RenewalEventType') THEN
    CREATE TYPE "RenewalEventType" AS ENUM ('CONTACTED', 'TEMPLATE_SENT', 'QUOTED', 'PAID', 'RENEWED', 'LOST', 'NOTE', 'AUTO_RULE_RUN');
  END IF;
END $$;

-- Ensure tables exist
CREATE TABLE IF NOT EXISTS "RenewalItem" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "contactId" INTEGER,
    "serviceType" "RenewalServiceType" NOT NULL,
    "serviceName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RenewalItemStatus" NOT NULL DEFAULT 'UPCOMING',
    "expectedValue" INTEGER,
    "probability" INTEGER NOT NULL DEFAULT 70,
    "assignedToUserId" INTEGER,
    "lastContactedAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "lastTemplateName" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RenewalEventLog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "renewalItemId" INTEGER NOT NULL,
    "type" "RenewalEventType" NOT NULL,
    "channel" TEXT,
    "messageId" INTEGER,
    "payload" JSONB,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS "RenewalItem_expiresAt_idx" ON "RenewalItem"("expiresAt");
CREATE INDEX IF NOT EXISTS "RenewalItem_status_expiresAt_idx" ON "RenewalItem"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "RenewalItem_leadId_idx" ON "RenewalItem"("leadId");
CREATE INDEX IF NOT EXISTS "RenewalItem_assignedToUserId_status_expiresAt_idx" ON "RenewalItem"("assignedToUserId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "RenewalEventLog_renewalItemId_createdAt_idx" ON "RenewalEventLog"("renewalItemId", "createdAt");

-- Foreign keys (idempotent guards)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RenewalItem_leadId_fkey'
  ) THEN
    ALTER TABLE "RenewalItem"
      ADD CONSTRAINT "RenewalItem_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RenewalItem_assignedToUserId_fkey'
  ) THEN
    ALTER TABLE "RenewalItem"
      ADD CONSTRAINT "RenewalItem_assignedToUserId_fkey"
      FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RenewalEventLog_renewalItemId_fkey'
  ) THEN
    ALTER TABLE "RenewalEventLog"
      ADD CONSTRAINT "RenewalEventLog_renewalItemId_fkey"
      FOREIGN KEY ("renewalItemId") REFERENCES "RenewalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RenewalEventLog_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "RenewalEventLog"
      ADD CONSTRAINT "RenewalEventLog_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
