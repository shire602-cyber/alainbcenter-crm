-- CreateTable
CREATE TABLE "ServiceType" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
CREATE TABLE "new_Lead" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "contactId" INTEGER NOT NULL,
    "leadType" TEXT,
    "serviceTypeId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'new',
    "pipelineStage" TEXT NOT NULL DEFAULT 'new',
    "urgency" TEXT,
    "notes" TEXT,
    "priorityScore" INTEGER,
    "aiScore" INTEGER,
    "aiNotes" TEXT,
    "expiryDate" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "autoWorkflowStatus" TEXT,
    "expiry90Sent" BOOLEAN NOT NULL DEFAULT false,
    "expiry30Sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("aiNotes", "aiScore", "autoWorkflowStatus", "contactId", "createdAt", "expiry30Sent", "expiry90Sent", "expiryDate", "id", "leadType", "nextFollowUpAt", "notes", "pipelineStage", "priorityScore", "status", "updatedAt", "urgency") SELECT "aiNotes", "aiScore", "autoWorkflowStatus", "contactId", "createdAt", "expiry30Sent", "expiry90Sent", "expiryDate", "id", "leadType", "nextFollowUpAt", "notes", "pipelineStage", "priorityScore", "status", "updatedAt", "urgency" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_code_key" ON "ServiceType"("code");
