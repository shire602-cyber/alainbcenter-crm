-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "autoWorkflowStatus" TEXT;
ALTER TABLE "Lead" ADD COLUMN "expiryDate" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "nextFollowUpAt" DATETIME;

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageSnippet" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
