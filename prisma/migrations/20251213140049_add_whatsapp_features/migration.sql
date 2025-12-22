-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN "deliveredAt" DATETIME;
ALTER TABLE "CommunicationLog" ADD COLUMN "deliveryStatus" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN "failedAt" DATETIME;
ALTER TABLE "CommunicationLog" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN "readAt" DATETIME;
ALTER TABLE "CommunicationLog" ADD COLUMN "whatsappMessageId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "nationality" TEXT,
    "source" TEXT,
    "whatsappOptOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Contact" ("createdAt", "email", "fullName", "id", "nationality", "phone", "source") SELECT "createdAt", "email", "fullName", "id", "nationality", "phone", "source" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
