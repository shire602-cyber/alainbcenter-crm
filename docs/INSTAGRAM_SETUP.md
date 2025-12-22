# Instagram Direct Messages Integration

## Overview
Instagram Direct Messages (DMs) are now integrated into the centralized inbox, allowing you to manage Instagram conversations alongside WhatsApp in one place.

## Setup Instructions

### 1. Meta App Configuration

1. **Create/Configure Meta App**:
   - Go to [Meta for Developers](https://developers.facebook.com/)
   - Create a new app or use existing one
   - Add "Instagram" product to your app
   - Request permissions:
     - `instagram_basic`
     - `instagram_manage_messages`

2. **Get Access Token**:
   - Generate a User Access Token with Instagram permissions
   - Exchange for Long-Lived Access Token (60 days)
   - Store in Integration model or environment variable

3. **Get Instagram Page ID**:
   - Your Instagram Business account is linked to a Facebook Page
   - Find the Page ID in Meta Business Suite or Graph API Explorer
   - This is needed for sending messages

### 2. Webhook Configuration

1. **Set Webhook URL**:
   - In Meta App Dashboard → Webhooks
   - Add Callback URL: `https://yourdomain.com/api/webhooks/instagram`
   - Verify Token: Set a secure token (store in Integration config or `INSTAGRAM_VERIFY_TOKEN` env var)

2. **Subscribe to Events**:
   - Subscribe to `messages` event
   - Subscribe to `messaging_postbacks` (optional, for interactions)

3. **Enable Message Access**:
   - On your Instagram Professional account:
   - Settings → Privacy → Messages → Message Controls
   - Under "Connected Tools", enable "Allow access to messages"

### 3. Integration Configuration

Store credentials in the Integration model:

```json
{
  "name": "instagram",
  "provider": "Meta",
  "isEnabled": true,
  "accessToken": "YOUR_LONG_LIVED_ACCESS_TOKEN",
  "apiSecret": "YOUR_APP_SECRET",
  "config": {
    "webhookVerifyToken": "YOUR_VERIFY_TOKEN",
    "pageId": "YOUR_INSTAGRAM_PAGE_ID",
    "instagramPageId": "YOUR_INSTAGRAM_PAGE_ID"
  }
}
```

Or use environment variables:
- `INSTAGRAM_VERIFY_TOKEN` - Webhook verification token
- `INSTAGRAM_APP_SECRET` - App Secret for signature verification
- `INSTAGRAM_PAGE_ID` - Instagram Page ID for sending messages
- `META_ACCESS_TOKEN` or `INSTAGRAM_ACCESS_TOKEN` - Access token

### 4. How It Works

**Inbound Messages**:
- Instagram webhook receives message → `/api/webhooks/instagram`
- Creates/updates Contact (using Instagram user ID)
- Creates/updates Lead
- Creates Conversation (channel: 'instagram')
- Creates Message record (status: 'delivered')
- Creates CommunicationLog entry
- Updates Lead.lastContactAt and lastContactChannel

**Outbound Messages**:
- User replies in inbox → `/api/inbox/conversations/[id]/reply`
- Detects channel from conversation
- Sends via Instagram Messaging API
- Creates Message and CommunicationLog records

**Inbox Display**:
- Channel tabs: WhatsApp | Instagram
- Filters conversations by selected channel
- Shows all messages in unified thread view

## Testing

1. **Test Webhook Verification**:
   ```
   GET /api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123
   ```
   Should return: `test123`

2. **Send Test Message**:
   - Send a DM to your Instagram Business account
   - Check logs for webhook receipt
   - Verify conversation appears in inbox

3. **Test Reply**:
   - Open Instagram conversation in inbox
   - Send reply
   - Verify message appears in Instagram

## Troubleshooting

- **Webhook not receiving messages**: Check Instagram account has "Connected Tools" enabled
- **Can't send messages**: Verify Page ID and Access Token are correct
- **Messages not appearing**: Check ExternalEventLog for webhook events
- **Signature verification fails**: Ensure App Secret matches in Integration config
