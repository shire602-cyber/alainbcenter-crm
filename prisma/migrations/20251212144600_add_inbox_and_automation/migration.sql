-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "lastContactAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "daysBeforeExpiry" INTEGER,
    "followupAfterDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "SentAutomation" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SentAutomation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SentAutomation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
CREATE TABLE "new_CommunicationLog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageSnippet" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CommunicationLog" ("channel", "createdAt", "direction", "id", "leadId", "messageSnippet") SELECT "channel", "createdAt", "direction", "id", "leadId", "messageSnippet" FROM "CommunicationLog";
DROP TABLE "CommunicationLog";
ALTER TABLE "new_CommunicationLog" RENAME TO "CommunicationLog";
