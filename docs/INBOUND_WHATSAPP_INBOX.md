# 📥 Inbound WhatsApp → Inbox Implementation

## Overview
Complete implementation of inbound WhatsApp messages flowing into the CRM Inbox with conversation threading and reply functionality.

## Features Implemented

### 1. Database Schema Updates
- **Conversation model**: Added `status`, `assignedToId`, `unreadCount` fields
- **CommunicationLog model**: Added `externalId`, `from`, `to`, `body`, `meta` fields for proper message storage
- **Indexes**: Added indexes for performance (`channel`, `lastMessageAt`, `conversationId`, `createdAt`)

### 2. Webhook Handler (`/api/webhooks/whatsapp`)
- **Inbound Message Processing**:
  - Receives messages from Meta WhatsApp Cloud API
  - Deduplicates using `externalId` (WhatsApp message ID)
  - Creates/updates Contact by phone number (E.164 normalized)
  - Creates/updates Lead if missing
  - Creates/updates Conversation thread
  - Creates CommunicationLog entry with full metadata
  - Increments Conversation `unreadCount`
  - Updates `lastMessageAt` timestamp

### 3. API Endpoints

#### `GET /api/inbox/conversations`
- Lists all conversations for a channel (default: whatsapp)
- Returns contact info, last message preview, unread count
- Sorted by `lastMessageAt` descending

#### `GET /api/inbox/conversations/[id]`
- Returns full conversation details with all messages
- Messages in chronological order
- Includes delivery status for outbound messages

#### `POST /api/inbox/conversations/[id]/read`
- Marks conversation as read
- Sets `unreadCount` to 0
- Marks all inbound messages as read

#### `POST /api/inbox/conversations/[id]/reply`
- Sends WhatsApp message via Meta Graph API
- Creates outbound CommunicationLog entry
- Updates Conversation `lastMessageAt` and `unreadCount` (sets to 0)
- Updates Lead `lastContactAt`

### 4. Inbox UI (`/inbox`)
- **Left Panel**: Conversation list with search
  - Shows contact name/phone
  - Last message preview
  - Unread badge
  - Timestamp (relative)
- **Right Panel**: Message thread
  - Chronological message display
  - Inbound/outbound styling
  - Delivery status indicators (sent/delivered/read/failed)
  - Reply box with Send button
  - Auto-scroll to latest message

## Setup Instructions

### Step 1: Run Database Migration

```bash
npx prisma migrate dev --name add_conversation_fields
```

This will:
- Add new fields to `Conversation` model
- Add new fields to `CommunicationLog` model
- Create indexes for performance

### Step 2: Generate Prisma Client

```bash
npx prisma generate
```

**Note**: If you get a file lock error (`EPERM`), stop your dev server, run the command, then restart the server.

### Step 3: Restart Dev Server

```bash
npm run dev
```

## Testing

### Test Inbound Messages

1. **Send a WhatsApp message** to your business number from a test phone
2. **Check webhook logs**:
   - Meta should send webhook to `/api/webhooks/whatsapp`
   - Check server console for "📥 Received inbound message" logs
3. **Verify in database**:
   - Check `Contact` table - should have new contact
   - Check `Conversation` table - should have new conversation with `unreadCount = 1`
   - Check `CommunicationLog` table - should have inbound entry with `externalId`
4. **Verify in UI**:
   - Go to `/inbox`
   - Should see new conversation in left panel
   - Click to open - should see message thread
   - Unread badge should show "1"

### Test Outbound Replies

1. **Open a conversation** in `/inbox`
2. **Type a message** in the reply box
3. **Click Send**
4. **Verify**:
   - Message appears in thread immediately
   - Delivery status shows "sent" initially
   - Webhook updates status to "delivered" when recipient receives
   - Status updates to "read" when recipient reads (if enabled)

### Test Deduplication

1. **Send the same message twice** (or trigger webhook twice)
2. **Verify**: Only one `CommunicationLog` entry is created (second one is skipped)

## API Response Formats

### `GET /api/inbox/conversations`
```json
{
  "ok": true,
  "conversations": [
    {
      "id": 1,
      "contact": {
        "id": 1,
        "fullName": "John Doe",
        "phone": "+971501234567",
        "email": null
      },
      "channel": "whatsapp",
      "status": "open",
      "lastMessageAt": "2024-01-01T12:00:00.000Z",
      "unreadCount": 1,
      "lastMessage": {
        "id": 1,
        "direction": "inbound",
        "body": "Hello!",
        "createdAt": "2024-01-01T12:00:00.000Z"
      },
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

### `GET /api/inbox/conversations/[id]`
```json
{
  "ok": true,
  "conversation": {
    "id": 1,
    "contact": { ... },
    "channel": "whatsapp",
    "status": "open",
    "lastMessageAt": "2024-01-01T12:00:00.000Z",
    "unreadCount": 0,
    "messages": [
      {
        "id": 1,
        "direction": "inbound",
        "channel": "whatsapp",
        "from": "+971501234567",
        "to": null,
        "body": "Hello!",
        "messageSnippet": "Hello!",
        "deliveryStatus": null,
        "deliveredAt": null,
        "readAt": null,
        "failedAt": null,
        "failureReason": null,
        "createdAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### `POST /api/inbox/conversations/[id]/reply`
```json
{
  "text": "Hello, how can I help you?"
}
```

Response:
```json
{
  "ok": true,
  "messageId": "wamid.xxx",
  "message": "Message sent successfully"
}
```

## Security

- All inbox API routes require authentication (`requireAuthApi`)
- Webhook endpoint is public (required by Meta) but verifies HMAC signature
- Phone numbers are normalized to E.164 format
- Message deduplication prevents replay attacks

## Troubleshooting

### Messages not appearing in inbox
1. Check webhook is receiving messages (check server logs)
2. Check `CommunicationLog` table for entries with `direction='inbound'`
3. Check `Conversation` table for entries
4. Verify webhook is creating contacts/leads correctly

### Reply not sending
1. Check WhatsApp integration is enabled in `/admin/integrations`
2. Check access token and phone number ID are configured
3. Check server logs for API errors
4. Verify phone number format (must be E.164)

### Unread count not updating
1. Check `POST /api/inbox/conversations/[id]/read` is being called
2. Verify Prisma migration was run successfully
3. Check database for `unreadCount` field on `Conversation` model

## Future Enhancements

- Real-time updates (WebSocket/Polling)
- Message search/filtering
- Conversation assignment to agents
- Conversation status management (open/pending/closed)
- Support for other channels (email, SMS)
- File attachments support
- Message reactions
- Typing indicators



## Overview
Complete implementation of inbound WhatsApp messages flowing into the CRM Inbox with conversation threading and reply functionality.

## Features Implemented

### 1. Database Schema Updates
- **Conversation model**: Added `status`, `assignedToId`, `unreadCount` fields
- **CommunicationLog model**: Added `externalId`, `from`, `to`, `body`, `meta` fields for proper message storage
- **Indexes**: Added indexes for performance (`channel`, `lastMessageAt`, `conversationId`, `createdAt`)

### 2. Webhook Handler (`/api/webhooks/whatsapp`)
- **Inbound Message Processing**:
  - Receives messages from Meta WhatsApp Cloud API
  - Deduplicates using `externalId` (WhatsApp message ID)
  - Creates/updates Contact by phone number (E.164 normalized)
  - Creates/updates Lead if missing
  - Creates/updates Conversation thread
  - Creates CommunicationLog entry with full metadata
  - Increments Conversation `unreadCount`
  - Updates `lastMessageAt` timestamp

### 3. API Endpoints

#### `GET /api/inbox/conversations`
- Lists all conversations for a channel (default: whatsapp)
- Returns contact info, last message preview, unread count
- Sorted by `lastMessageAt` descending

#### `GET /api/inbox/conversations/[id]`
- Returns full conversation details with all messages
- Messages in chronological order
- Includes delivery status for outbound messages

#### `POST /api/inbox/conversations/[id]/read`
- Marks conversation as read
- Sets `unreadCount` to 0
- Marks all inbound messages as read

#### `POST /api/inbox/conversations/[id]/reply`
- Sends WhatsApp message via Meta Graph API
- Creates outbound CommunicationLog entry
- Updates Conversation `lastMessageAt` and `unreadCount` (sets to 0)
- Updates Lead `lastContactAt`

### 4. Inbox UI (`/inbox`)
- **Left Panel**: Conversation list with search
  - Shows contact name/phone
  - Last message preview
  - Unread badge
  - Timestamp (relative)
- **Right Panel**: Message thread
  - Chronological message display
  - Inbound/outbound styling
  - Delivery status indicators (sent/delivered/read/failed)
  - Reply box with Send button
  - Auto-scroll to latest message

## Setup Instructions

### Step 1: Run Database Migration

```bash
npx prisma migrate dev --name add_conversation_fields
```

This will:
- Add new fields to `Conversation` model
- Add new fields to `CommunicationLog` model
- Create indexes for performance

### Step 2: Generate Prisma Client

```bash
npx prisma generate
```

**Note**: If you get a file lock error (`EPERM`), stop your dev server, run the command, then restart the server.

### Step 3: Restart Dev Server

```bash
npm run dev
```

## Testing

### Test Inbound Messages

1. **Send a WhatsApp message** to your business number from a test phone
2. **Check webhook logs**:
   - Meta should send webhook to `/api/webhooks/whatsapp`
   - Check server console for "📥 Received inbound message" logs
3. **Verify in database**:
   - Check `Contact` table - should have new contact
   - Check `Conversation` table - should have new conversation with `unreadCount = 1`
   - Check `CommunicationLog` table - should have inbound entry with `externalId`
4. **Verify in UI**:
   - Go to `/inbox`
   - Should see new conversation in left panel
   - Click to open - should see message thread
   - Unread badge should show "1"

### Test Outbound Replies

1. **Open a conversation** in `/inbox`
2. **Type a message** in the reply box
3. **Click Send**
4. **Verify**:
   - Message appears in thread immediately
   - Delivery status shows "sent" initially
   - Webhook updates status to "delivered" when recipient receives
   - Status updates to "read" when recipient reads (if enabled)

### Test Deduplication

1. **Send the same message twice** (or trigger webhook twice)
2. **Verify**: Only one `CommunicationLog` entry is created (second one is skipped)

## API Response Formats

### `GET /api/inbox/conversations`
```json
{
  "ok": true,
  "conversations": [
    {
      "id": 1,
      "contact": {
        "id": 1,
        "fullName": "John Doe",
        "phone": "+971501234567",
        "email": null
      },
      "channel": "whatsapp",
      "status": "open",
      "lastMessageAt": "2024-01-01T12:00:00.000Z",
      "unreadCount": 1,
      "lastMessage": {
        "id": 1,
        "direction": "inbound",
        "body": "Hello!",
        "createdAt": "2024-01-01T12:00:00.000Z"
      },
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

### `GET /api/inbox/conversations/[id]`
```json
{
  "ok": true,
  "conversation": {
    "id": 1,
    "contact": { ... },
    "channel": "whatsapp",
    "status": "open",
    "lastMessageAt": "2024-01-01T12:00:00.000Z",
    "unreadCount": 0,
    "messages": [
      {
        "id": 1,
        "direction": "inbound",
        "channel": "whatsapp",
        "from": "+971501234567",
        "to": null,
        "body": "Hello!",
        "messageSnippet": "Hello!",
        "deliveryStatus": null,
        "deliveredAt": null,
        "readAt": null,
        "failedAt": null,
        "failureReason": null,
        "createdAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### `POST /api/inbox/conversations/[id]/reply`
```json
{
  "text": "Hello, how can I help you?"
}
```

Response:
```json
{
  "ok": true,
  "messageId": "wamid.xxx",
  "message": "Message sent successfully"
}
```

## Security

- All inbox API routes require authentication (`requireAuthApi`)
- Webhook endpoint is public (required by Meta) but verifies HMAC signature
- Phone numbers are normalized to E.164 format
- Message deduplication prevents replay attacks

## Troubleshooting

### Messages not appearing in inbox
1. Check webhook is receiving messages (check server logs)
2. Check `CommunicationLog` table for entries with `direction='inbound'`
3. Check `Conversation` table for entries
4. Verify webhook is creating contacts/leads correctly

### Reply not sending
1. Check WhatsApp integration is enabled in `/admin/integrations`
2. Check access token and phone number ID are configured
3. Check server logs for API errors
4. Verify phone number format (must be E.164)

### Unread count not updating
1. Check `POST /api/inbox/conversations/[id]/read` is being called
2. Verify Prisma migration was run successfully
3. Check database for `unreadCount` field on `Conversation` model

## Future Enhancements

- Real-time updates (WebSocket/Polling)
- Message search/filtering
- Conversation assignment to agents
- Conversation status management (open/pending/closed)
- Support for other channels (email, SMS)
- File attachments support
- Message reactions
- Typing indicators




















