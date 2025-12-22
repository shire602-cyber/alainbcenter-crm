-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contactId" INTEGER NOT NULL,
    "leadType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "urgency" TEXT,
    "notes" TEXT,
    "priorityScore" INTEGER,
    "aiScore" INTEGER,
    "aiNotes" TEXT,
    "expiryDate" DATETIME,
    "nextFollowUpAt" DATETIME,
    "autoWorkflowStatus" TEXT,
    "expiry90Sent" BOOLEAN NOT NULL DEFAULT false,
    "expiry30Sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("aiNotes", "aiScore", "autoWorkflowStatus", "contactId", "createdAt", "expiryDate", "id", "leadType", "nextFollowUpAt", "notes", "priorityScore", "status", "updatedAt", "urgency") SELECT "aiNotes", "aiScore", "autoWorkflowStatus", "contactId", "createdAt", "expiryDate", "id", "leadType", "nextFollowUpAt", "notes", "priorityScore", "status", "updatedAt", "urgency" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
