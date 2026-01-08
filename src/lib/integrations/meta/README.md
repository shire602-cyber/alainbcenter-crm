# Meta Integration (Facebook/Instagram)

This module provides a production-ready Meta Business integration for Instagram Direct Messages, Facebook Messenger, and Lead Ads.

## Features

- **OAuth Flow**: Secure Meta Business Login integration
- **Webhook Handling**: Receives and processes Instagram DMs, Facebook Messenger messages, and Lead Ads
- **Multi-Page Support**: Connects multiple Facebook pages and their associated Instagram Business accounts
- **Secure Token Storage**: Encrypted access tokens using AES-256-GCM
- **Event Storage**: Raw webhook events stored for audit and manual processing

## Environment Variables

Add these to your `.env` file or Vercel environment variables:

```bash
# Meta App Credentials (from Meta Developers)
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_VERIFY_TOKEN=your_secure_random_token

# OAuth Configuration
META_OAUTH_REDIRECT_URI=https://your-domain.com/api/integrations/meta/callback

# Optional: Webhook URL (defaults to /api/webhooks/meta)
META_WEBHOOK_URL=https://your-domain.com/api/webhooks/meta

# Optional: Encryption key (defaults to SESSION_SECRET)
META_ENCRYPTION_KEY=your_encryption_key
```

## Meta App Configuration

### 1. Create a Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app or select an existing one
3. Add the following products:
   - **Instagram Basic Display** (for Instagram DMs)
   - **Messenger** (for Facebook Messenger)
   - **Lead Ads** (for Lead Ads - optional)

### 2. Configure OAuth Settings

1. Go to **Settings** → **Basic**
2. Add **Valid OAuth Redirect URIs**:
   ```
   https://your-domain.com/api/integrations/meta/callback
   ```
3. Save changes

### 3. Configure Webhook

1. Go to **Webhooks** in your app dashboard
2. Click **Add Callback URL**
3. Enter your webhook URL:
   ```
   https://your-domain.com/api/webhooks/meta
   ```
4. Enter your **Verify Token** (must match `META_VERIFY_TOKEN`)
5. Subscribe to the following webhook fields:
   - `messages` (Instagram DMs and Facebook Messenger)
   - `messaging_postbacks` (Postback events)
   - `messaging_optins` (Opt-in events)
   - `message_deliveries` (Delivery receipts)
   - `message_reads` (Read receipts)
   - `leadgen` (Lead Ads - optional)

### 4. Request Permissions

In **App Review**, request the following permissions:
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_metadata`
- `instagram_basic`
- `instagram_manage_messages`
- `pages_messaging`
- `pages_read_user_content`
- `leads_retrieval` (for Lead Ads)

### 5. Connect Instagram Business Account

1. In your Facebook Page settings, connect an Instagram Business Account
2. The integration will automatically detect and connect it during OAuth

## Database Migration

Run the migration to create the required tables:

```bash
npx prisma migrate dev --name add_meta_integration
```

Or apply the migration manually:

```bash
psql $DATABASE_URL -f prisma/migrations/20260110000000_add_meta_integration/migration.sql
```

## Usage

### Connect Meta Account

1. Go to `/admin/integrations`
2. Find the "Meta (FB/IG)" card
3. Click "Connect Meta (FB/IG)"
4. Authorize the app in Meta's OAuth dialog
5. Select the pages you want to connect
6. The integration will automatically:
   - Store encrypted access tokens
   - Connect Instagram Business accounts
   - Subscribe pages to webhooks

### View Connected Pages

After connecting, the integrations page will show:
- Connected page names
- Instagram usernames (if connected)
- Option to reconnect

### Webhook Events

Webhook events are automatically:
1. **Stored** in `meta_webhook_events` table for audit
2. **Processed** for Instagram/Facebook messages:
   - Creates/updates contacts
   - Creates conversations
   - Creates messages in inbox
   - Triggers automation (if enabled)

### Manual Event Processing

Events stored in `meta_webhook_events` can be processed manually if needed:

```sql
SELECT * FROM meta_webhook_events
WHERE event_type = 'page'
ORDER BY received_at DESC
LIMIT 10;
```

## Security

- **Token Encryption**: All access tokens are encrypted using AES-256-GCM
- **Webhook Verification**: Signature verification using `x-hub-signature-256` header
- **State Validation**: OAuth state parameter validated to prevent CSRF

## Troubleshooting

### OAuth Flow Fails

- Check that `META_OAUTH_REDIRECT_URI` matches exactly in Meta app settings
- Verify `META_APP_ID` and `META_APP_SECRET` are correct
- Check browser console for errors

### Webhook Not Receiving Events

- Verify webhook URL is accessible (not behind firewall)
- Check `META_VERIFY_TOKEN` matches in Meta app settings
- Ensure webhook fields are subscribed in Meta app dashboard
- Check server logs for webhook verification errors

### Messages Not Appearing in Inbox

- Check `meta_webhook_events` table to see if events are being received
- Verify page is subscribed to `messages` webhook field
- Check that Instagram Business Account is connected to the page
- Review server logs for processing errors

### Token Decryption Errors

- Ensure `META_ENCRYPTION_KEY` (or `SESSION_SECRET`) hasn't changed
- If encryption key changed, reconnect the integration

## Architecture

```
/api/integrations/meta/start
  → Redirects to Meta OAuth

/api/integrations/meta/callback
  → Exchanges code for token
  → Gets user pages
  → Gets page tokens
  → Connects Instagram accounts
  → Subscribes to webhooks
  → Stores encrypted tokens

/api/webhooks/meta (GET)
  → Webhook verification

/api/webhooks/meta (POST)
  → Receives events
  → Stores in meta_webhook_events
  → Processes messages (optional)
  → Creates inbox messages (optional)
```

## Files

- `src/lib/integrations/meta/encryption.ts` - Token encryption/decryption
- `src/lib/integrations/meta/api.ts` - Meta Graph API helpers
- `src/app/api/integrations/meta/start/route.ts` - OAuth initiation
- `src/app/api/integrations/meta/callback/route.ts` - OAuth callback
- `src/app/api/webhooks/meta/route.ts` - Webhook handler

## Notes

- This integration does NOT modify AI, auto-reply, or other fragile modules
- Messages are inserted via the safe `handleInboundMessageAutoMatch` function
- Events are always stored for manual processing if automatic processing fails
- Workspace ID defaults to 1 (single-tenant setup)

