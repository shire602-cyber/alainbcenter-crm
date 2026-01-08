-- CreateTable: meta_connections
-- Stores OAuth connections to Meta pages/Instagram accounts
CREATE TABLE IF NOT EXISTS "meta_connections" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "workspace_id" INTEGER DEFAULT 1,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT,
    "page_access_token" TEXT NOT NULL,
    "ig_business_id" TEXT,
    "ig_username" TEXT,
    "scopes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_connections_workspace_id_page_id_key" UNIQUE ("workspace_id", "page_id")
);

-- CreateTable: meta_webhook_events
-- Stores raw webhook events from Meta for processing
CREATE TABLE IF NOT EXISTS "meta_webhook_events" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "workspace_id" INTEGER DEFAULT 1,
    "page_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meta_connections_workspace_id_idx" ON "meta_connections"("workspace_id");
CREATE INDEX IF NOT EXISTS "meta_connections_page_id_idx" ON "meta_connections"("page_id");
CREATE INDEX IF NOT EXISTS "meta_connections_status_idx" ON "meta_connections"("status");
CREATE INDEX IF NOT EXISTS "meta_webhook_events_workspace_id_idx" ON "meta_webhook_events"("workspace_id");
CREATE INDEX IF NOT EXISTS "meta_webhook_events_page_id_idx" ON "meta_webhook_events"("page_id");
CREATE INDEX IF NOT EXISTS "meta_webhook_events_event_type_idx" ON "meta_webhook_events"("event_type");
CREATE INDEX IF NOT EXISTS "meta_webhook_events_received_at_idx" ON "meta_webhook_events"("received_at");

