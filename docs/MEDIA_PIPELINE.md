# Media Pipeline Documentation

## Overview

The media pipeline ensures WhatsApp media (images, audio, PDFs, videos) are reliably stored and retrieved using a deterministic approach.

## Key Concepts

### providerMediaId (REQUIRED)

**What it is:** Meta Graph API media ID (e.g., `"882580977660655"`)

**Why it's required:** 
- WhatsApp media URLs are temporary and expire
- We need a stable identifier to fetch media on-demand
- `providerMediaId` is the canonical identifier from Meta

**Storage:** Stored in `Message.providerMediaId` field (added in Phase B)

### Media Proxy (`/api/media/messages/:id`)

**Purpose:** Secure server-side proxy that:
1. Fetches media from Meta Graph API using `providerMediaId`
2. Streams media to client with proper headers
3. Handles Range requests for audio/video streaming
4. Returns 410 Gone if metadata is missing

## Data Flow

### Ingest (Webhook → Database)

```
WhatsApp Webhook
  ↓
Extract providerMediaId from message.image.id / message.audio.id / etc.
  ↓
Store in Message.providerMediaId
  ↓
Also store: mediaMimeType, mediaFilename, mediaSize, mediaSha256
```

### Retrieval (UI → Proxy → Meta)

```
UI requests: /api/media/messages/123
  ↓
Proxy looks up Message.id=123
  ↓
Resolution order:
  A) message.providerMediaId (canonical)
  B) message.mediaUrl if it looks like media ID
  C) Extract from payload/rawPayload (fallback)
  D) ExternalEventLog recovery (last resort)
  ↓
If found: GET https://graph.facebook.com/v19.0/{providerMediaId}
  ↓
Get download URL + mime_type
  ↓
Stream media to client with Range support
```

## Error Handling

### 410 Gone (MEDIA_METADATA_MISSING)

**When:** Message exists but has no `providerMediaId` and cannot be recovered

**Response:**
```json
{
  "error": "MEDIA_METADATA_MISSING",
  "hint": "Message was stored without providerMediaId; cannot fetch from WhatsApp.",
  "messageId": 123,
  "providerMessageId": "wamid.xxx"
}
```

**UI Behavior:** Show "Media unavailable (metadata not stored)" message

### 404 Not Found

**When:** Message doesn't exist or media not found in provider

**Response:**
```json
{
  "error": "media_missing",
  "messageId": 123
}
```

## Database Schema

```prisma
model Message {
  providerMediaId   String?  // REQUIRED: Meta Graph API media ID
  mediaUrl          String?  // Legacy: may contain providerMediaId or temporary URL
  mediaMimeType     String?  // e.g., "image/jpeg", "audio/ogg"
  mediaFilename     String?  // For documents: "invoice.pdf"
  mediaSize         Int?     // File size in bytes
  mediaSha256       String?  // SHA256 hash (optional)
  // ... other fields
}
```

## Webhook Extraction

In `src/app/api/webhooks/whatsapp/route.ts`:

```typescript
// For image messages
if (message.image) {
  providerMediaId = message.image.id || message.image.media_id || null
  mediaMimeType = message.image.mime_type || 'image/jpeg'
  caption = message.image.caption || null
}

// For audio messages
if (message.audio) {
  providerMediaId = message.audio.id || message.audio.media_id || null
  mediaMimeType = message.audio.mime_type || 'audio/ogg'
}

// For document messages
if (message.document) {
  providerMediaId = message.document.id || message.document.media_id || null
  mediaMimeType = message.document.mime_type || 'application/pdf'
  filename = message.document.filename || null
}
```

## Proxy Resolution Priority

1. **message.providerMediaId** (canonical - REQUIRED for new messages)
2. **message.mediaUrl** if it looks like a media ID (not http URL)
3. **payload.media.id** (structured format)
4. **rawPayload** extraction (fallback for old messages)
5. **ExternalEventLog** recovery (last resort)

## Range Request Support

The proxy supports HTTP Range requests for audio/video streaming:

```
GET /api/media/messages/123
Range: bytes=0-1023
  ↓
Returns 206 Partial Content
Content-Range: bytes 0-1023/12345
```

This enables:
- Efficient audio/video playback
- Seeking without downloading entire file
- Progressive loading

## Verification Scripts

### `scripts/verify-media-new-message.ts`

Tests that messages with `providerMediaId`:
- Return 200/206 from proxy
- Support Range requests
- Have correct Content-Type

### `scripts/verify-media-missing-metadata.ts`

Tests that messages without `providerMediaId`:
- Return 410 Gone
- Include helpful error message

## Troubleshooting

### "Media unavailable (metadata not stored)"

**Cause:** Message was created before `providerMediaId` field was added

**Solution:** 
- Old messages: Cannot be fixed (metadata lost)
- New messages: Should always have `providerMediaId` - check webhook logs

### "Failed to load because no supported source was found"

**Cause:** Audio/video element tried to load invalid URL

**Solution:** 
- Audio player now checks URL with HEAD before loading
- Shows error message instead of browser error

### 404 on `/api/media/messages/:id`

**Cause:** 
- Message doesn't exist
- Media not found in Meta Graph API

**Solution:** 
- Check server logs for `[MEDIA-PROXY]` entries
- Verify `providerMediaId` is correct
- Check WhatsApp access token is valid

## Logging

Structured logs help debug issues:

```
[INGEST-MEDIA] { messageId, providerMessageId, type, providerMediaId, mime, filename }
[MEDIA-PROXY] RESOLVE { messageId, providerMediaId, resolvedSource }
[MEDIA-PROXY] GRAPH { providerMediaId, status }
[MEDIA-PROXY] STREAM { status, mime, ranged }
```

## Best Practices

1. **Always store `providerMediaId`** - Never rely on temporary URLs
2. **Use proxy URL in UI** - Never expose `providerMediaId` directly
3. **Handle 410 gracefully** - Show clear "metadata not stored" message
4. **Support Range requests** - Essential for audio/video streaming
5. **Log extraction failures** - Helps debug webhook issues








