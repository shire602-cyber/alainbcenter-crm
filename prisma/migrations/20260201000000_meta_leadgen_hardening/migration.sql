ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "meta_leadgen_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_meta_leadgen_id_key" ON "Lead" ("meta_leadgen_id");

ALTER TABLE "ExternalEventLog"
  ADD COLUMN IF NOT EXISTS "eventType" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "error" TEXT;

CREATE TABLE IF NOT EXISTS "meta_leadgen_state" (
  "id" SERIAL PRIMARY KEY,
  "workspace_id" INTEGER DEFAULT 1,
  "selected_page_id" TEXT,
  "selected_ad_account_id" TEXT,
  "selected_form_ids" TEXT,
  "webhook_subscribed_at" TIMESTAMP,
  "last_leadgen_received_at" TIMESTAMP,
  "last_leadgen_processed_at" TIMESTAMP,
  "last_poll_at" TIMESTAMP,
  "last_poll_cursor" TEXT,
  "last_poll_run_at" TIMESTAMP,
  "poller_enabled" BOOLEAN DEFAULT TRUE,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "meta_leadgen_state_workspace_id_key" ON "meta_leadgen_state" ("workspace_id");

CREATE TABLE IF NOT EXISTS "service_routing_config" (
  "id" SERIAL PRIMARY KEY,
  "workspace_id" INTEGER DEFAULT 1,
  "mapping" TEXT,
  "last_assigned_index" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_routing_config_workspace_id_key" ON "service_routing_config" ("workspace_id");
