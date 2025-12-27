-- CreateTable
CREATE TABLE "Integration" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "webhookUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "config" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "leadId" INTEGER,
    "contactId" INTEGER,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "senderName" TEXT,
    "senderPhone" TEXT,
    "senderEmail" TEXT,
    "attachments" TEXT,
    "metadata" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_name_key" ON "Integration"("name");
