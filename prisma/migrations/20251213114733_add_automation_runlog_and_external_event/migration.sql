-- CreateTable
CREATE TABLE "AutomationRunLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dateKey" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ruleId" INTEGER,
    "leadId" INTEGER,
    CONSTRAINT "AutomationRunLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomationRunLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRunLog_dateKey_ruleId_leadId_actionKey_key" ON "AutomationRunLog"("dateKey", "ruleId", "leadId", "actionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEvent_provider_eventId_key" ON "ExternalEvent"("provider", "eventId");
