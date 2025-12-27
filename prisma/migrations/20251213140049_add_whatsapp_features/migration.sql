-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "CommunicationLog" ADD COLUMN "deliveryStatus" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "CommunicationLog" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "CommunicationLog" ADD COLUMN "whatsappMessageId" TEXT;

-- RedefineTables
CREATE TABLE "new_Contact" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "nationality" TEXT,
    "source" TEXT,
    "whatsappOptOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Contact" ("createdAt", "email", "fullName", "id", "nationality", "phone", "source") SELECT "createdAt", "email", "fullName", "id", "nationality", "phone", "source" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
