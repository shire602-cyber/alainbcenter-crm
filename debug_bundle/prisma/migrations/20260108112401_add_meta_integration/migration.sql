-- CreateTable
CREATE TABLE "meta_connections" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL DEFAULT 1,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT,
    "page_access_token" TEXT NOT NULL,
    "ig_business_id" TEXT,
    "ig_username" TEXT,
    "scopes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_webhook_events" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL DEFAULT 1,
    "page_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_connections_workspace_id_page_id_key" ON "meta_connections"("workspace_id", "page_id");

-- CreateIndex
CREATE INDEX "meta_connections_workspace_id_idx" ON "meta_connections"("workspace_id");

-- CreateIndex
CREATE INDEX "meta_connections_page_id_idx" ON "meta_connections"("page_id");

-- CreateIndex
CREATE INDEX "meta_connections_status_idx" ON "meta_connections"("status");

-- CreateIndex
CREATE INDEX "meta_webhook_events_workspace_id_idx" ON "meta_webhook_events"("workspace_id");

-- CreateIndex
CREATE INDEX "meta_webhook_events_page_id_idx" ON "meta_webhook_events"("page_id");

-- CreateIndex
CREATE INDEX "meta_webhook_events_event_type_idx" ON "meta_webhook_events"("event_type");

-- CreateIndex
CREATE INDEX "meta_webhook_events_received_at_idx" ON "meta_webhook_events"("received_at");

