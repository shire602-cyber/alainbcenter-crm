-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "autoWorkflowStatus" TEXT;
ALTER TABLE "Lead" ADD COLUMN "expiryDate" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageSnippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
