# Meta Integration - Tester Token Setup

This guide explains how to set up the Meta integration using a tester token for internal-only use.

## Overview

The Meta integration allows you to:
- Receive Instagram Direct Messages
- Receive Facebook Messenger messages
- Receive Lead Ads (future)
- All via webhook events stored in the database

## Prerequisites

1. A Meta Developers account
2. A Meta App created in Meta for Developers
3. A Facebook Page
4. An Instagram Business Account connected to your Facebook Page

## Step 1: Create a Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Business** as the app type
4. Fill in app details and create the app

## Step 2: Generate a Tester Token

1. In your Meta App dashboard, go to **Tools** → **Graph API Explorer**
2. Select your app from the dropdown
3. Select a User Token (not Page Token)
4. Click **Generate Access Token**
5. Grant the following permissions:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_messaging`
   - `pages_read_user_content`
   - `leads_retrieval` (optional, for Lead Ads)
6. Copy the generated token

**Note**: Tester tokens expire after 60 days. For production, you'll need to implement token refresh or use a long-lived token.

## Step 3: Configure Webhook

1. In your Meta App dashboard, go to **Instagram** → **API Setup** → **Webhooks**
2. **Important**: The webhook URL should be:
   ```
   https://your-domain.vercel.app/api/webhooks/meta
   ```
   **NOT** `/api/webhooks/whatsapp` (that's for WhatsApp, not Meta/Instagram)
3. Enter your **Verify Token** (you can set this in the admin UI when connecting, or use `META_VERIFY_TOKEN` env var)
4. Click **Verify and Save**
5. Subscribe to the following webhook fields:
   - `messages`
   - `messaging_postbacks`
   - `message_deliveries`
   - `message_reads`
   - `leadgen` (optional)

## Step 4: Subscribe to Webhook Fields

After connecting via the admin UI, the system will automatically subscribe your page to:
- `messages` - Instagram DMs and Facebook Messenger messages
- `messaging_postbacks` - Postback events
- `message_deliveries` - Delivery receipts
- `message_reads` - Read receipts
- `leadgen` - Lead Ads (for future use)

## Step 5: Connect in Admin UI

1. Go to `/admin/integrations`
2. Find the **Instagram Direct Messages** card
3. Paste your tester token in the input field
4. Click **Save & Connect**
5. The system will:
   - Validate your token
   - Fetch your Facebook Pages
   - Get the connected Instagram Business Account
   - Subscribe the page to webhooks
   - Store the connection (encrypted)

## Configuration

### Webhook Verify Token

The webhook verify token is **stored in the database** (not required as an environment variable):
- Set it via the admin UI when connecting
- Stored in the `Integration` table's `config` field for `instagram-messaging`
- Falls back to `META_VERIFY_TOKEN` environment variable for backward compatibility

### Environment Variables (Optional)

```bash
# Optional: Webhook verify token (fallback if not set in database)
META_VERIFY_TOKEN=your_secure_random_token

# Optional: For webhook signature verification (server-side only)
META_APP_SECRET=your_app_secret

# Optional: For encryption (server-side only, defaults to SESSION_SECRET)
META_ENCRYPTION_KEY=your_encryption_key
```

**Note**: 
- `META_APP_SECRET` is optional and only used server-side for signature verification
- `META_ENCRYPTION_KEY` is optional and only used server-side for token encryption
- Encryption keys are **never** stored in the database or exposed via UI

## Webhook Verification

The webhook endpoint (`/api/webhooks/meta`) handles verification automatically:
- **GET**: Returns the challenge token when Meta verifies the webhook
- **POST**: Receives and stores webhook events

## Testing

### Test Webhook URL

1. In the admin UI, click **Test Webhook** button
2. This will ping the webhook endpoint to verify it's reachable

### Test with Meta

1. Go to your Meta App → **Webhooks**
2. Click **Test** next to your webhook subscription
3. Meta will send a test event

## Troubleshooting

### Token Invalid

**Common causes:**
1. **Token expired**: Tester tokens expire after 60 days. Generate a new one.
2. **Missing permissions**: The token must have these permissions:
   - `pages_show_list` - To list your pages
   - `pages_read_engagement` - To read page data
   - `pages_manage_metadata` - To manage page subscriptions
   - `instagram_basic` - To access Instagram account
   - `instagram_manage_messages` - To manage Instagram messages
   - `pages_messaging` - To access messaging features
3. **Wrong token type**: Make sure you're using a **User Token** (not Page Token) from Graph API Explorer
4. **Token format**: The token should start with `EAAB...` or `EAA...`

**How to fix:**
1. Go to Meta Developers → Tools → Graph API Explorer
2. Select your app
3. Select "User Token" (not Page Token)
4. Click "Generate Access Token"
5. Grant all required permissions listed above
6. Copy the new token and paste it in the admin UI

**Error messages:**
- "Graph API error (401): Invalid OAuth access token" → Token expired or invalid
- "Graph API error (403): Insufficient permissions" → Missing required permissions
- "Graph API error (190): Invalid OAuth 2.0 Access Token" → Token format is wrong

### No Pages Found

- Ensure you have at least one Facebook Page
- Verify the token has `pages_show_list` permission
- Check that you're the admin of the page

### Instagram Account Not Connected

- Go to your Facebook Page settings
- Connect an Instagram Business Account
- Re-run the connection in the admin UI

### Webhook Not Receiving Events

- **Wrong webhook URL**: Make sure you're using `/api/webhooks/meta` (NOT `/api/webhooks/whatsapp`)
- Verify webhook URL is accessible (not behind firewall)
- Check verify token matches in both places (Meta app and database)
- Ensure webhook fields are subscribed (check in Meta Developers → Webhooks)
- Check server logs for errors
- The webhook URL is displayed in the admin UI after connecting - copy it from there

### Messages Not Appearing in Inbox

- Check `meta_webhook_events` table to see if events are being received
- Verify page is subscribed to `messages` webhook field
- Review server logs for processing errors

## Database Tables

### `meta_connections`

Stores OAuth connections:
- `id` - Primary key
- `workspace_id` - Workspace/tenant ID (null for single-tenant)
- `provider` - Always 'meta'
- `meta_user_id` - Meta user ID
- `page_id` - Facebook Page ID
- `page_name` - Page name
- `page_access_token` - Encrypted page access token
- `ig_business_id` - Instagram Business Account ID
- `ig_username` - Instagram username
- `scopes` - JSON array of granted scopes
- `trigger_subscribed` - Whether webhook subscription succeeded
- `status` - 'connected' or 'error'
- `last_error` - Last error message (if status is 'error')

### `meta_webhook_events`

Stores raw webhook events:
- `id` - Primary key
- `connection_id` - Foreign key to `meta_connections`
- `page_id` - Facebook Page ID
- `event_type` - Event type (e.g., 'page', 'instagram')
- `payload` - JSON payload
- `received_at` - Timestamp

## Security

- **Token Encryption**: All access tokens are encrypted at rest using AES-256-GCM
- **Webhook Verification**: Signature verification using `x-hub-signature-256` header (if `META_APP_SECRET` is set)
- **State Validation**: OAuth state parameter validated to prevent CSRF

## Architecture

```
Admin UI (/admin/integrations)
  → POST /api/integrations/meta/connect
    → Validates token
    → Fetches pages
    → Gets Instagram account
    → Subscribes to webhook
    → Stores encrypted connection

Meta Webhook
  → POST /api/webhooks/meta
    → Verifies signature (optional)
    → Stores event in meta_webhook_events
    → Optionally processes message (if safe function exists)
```

## Files

- `src/server/integrations/meta/graph.ts` - Graph API wrapper
- `src/server/integrations/meta/token.ts` - Token validation
- `src/server/integrations/meta/subscribe.ts` - Webhook subscription
- `src/server/integrations/meta/normalize.ts` - Event normalization
- `src/server/integrations/meta/storage.ts` - Database operations
- `src/app/api/integrations/meta/connect/route.ts` - Connect endpoint
- `src/app/api/integrations/meta/status/route.ts` - Status endpoint
- `src/app/api/integrations/meta/disconnect/route.ts` - Disconnect endpoint
- `src/app/api/webhooks/meta/route.ts` - Webhook handler
- `src/components/admin/MetaTesterIntegration.tsx` - Admin UI component

## Notes

- This integration is **internal-only** and uses tester tokens
- Tester tokens expire after 60 days - plan for token refresh
- All events are stored in `meta_webhook_events` for audit
- Messages are optionally inserted into inbox if safe function exists
- No AI/auto-reply logic is modified or called

