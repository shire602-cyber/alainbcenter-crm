-- Add OAuth token fields to MetaConnection table
-- These fields store long-lived user tokens and connection metadata for OAuth flow

ALTER TABLE "meta_connections" 
ADD COLUMN IF NOT EXISTS "meta_user_access_token_long" TEXT,
ADD COLUMN IF NOT EXISTS "meta_user_token_expires_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "meta_connected_at" TIMESTAMP(3);

-- Add comments
COMMENT ON COLUMN "meta_connections"."meta_user_access_token_long" IS 'Encrypted long-lived user access token (60 days)';
COMMENT ON COLUMN "meta_connections"."meta_user_token_expires_at" IS 'Expiration timestamp for long-lived user token';
COMMENT ON COLUMN "meta_connections"."meta_connected_at" IS 'Timestamp when OAuth connection was established';
