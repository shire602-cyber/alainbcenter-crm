# Media Proxy High-Signal Debug Output

## Summary

Added comprehensive structured logging and clear error responses to `/api/media/messages/[id]` route to enable precise debugging of media fetch failures.

## Files Changed

- `src/app/api/media/messages/[id]/route.ts`

## Changes

1. **Runtime Configuration**
   - Added `export const dynamic = 'force-dynamic'` (runtime already set to 'nodejs')

2. **Structured Logging (NO PII, NO TOKEN)**
   - Message metadata log (includes messageId, type, providerMediaId presence, rawPayload/payload presence)
   - Configuration check log (includes tokenPresent, tokenSource, phoneNumberIdPresent)
   - Graph API metadata fetch logs (status code, error body summary for failures)
   - Download fetch logs (status code, content-type for success, error body summary for failures)

3. **Error Response Format**
   - All error responses now include: `{ stage, status, hint }`
   - Stage values: `'token'`, `'metadata'`, `'download'`, or `'message'`
   - Distinct status codes: 404 (missing media), 500 (missing token), 502 (Meta API failures)

## Sample Log Output Format

### Success Flow

```json
{
  "level": "log",
  "prefix": "[MEDIA-PROXY]",
  "event": "Message fetched",
  "data": {
    "messageId": 12345,
    "messageType": "image",
    "hasProviderMediaId": true,
    "hasMediaUrl": false,
    "hasRawPayload": true,
    "hasPayload": true,
    "hasProviderMessageId": true
  }
}

{
  "level": "log",
  "prefix": "[MEDIA-PROXY]",
  "event": "Configuration check",
  "data": {
    "messageId": 12345,
    "messageType": "image",
    "hasProviderMediaId": true,
    "tokenPresent": true,
    "tokenSource": "db",
    "phoneNumberIdPresent": true
  }
}

{
  "level": "log",
  "prefix": "[MEDIA-PROXY]",
  "event": "Graph API metadata fetch success",
  "data": {
    "messageId": 12345,
    "messageType": "image",
    "providerMediaId": "1234567890_9876543210...",
    "statusCode": 200,
    "mimeType": "image/jpeg",
    "fileSize": 524288
  }
}

{
  "level": "log",
  "prefix": "[MEDIA-PROXY]",
  "event": "Download fetch success",
  "data": {
    "messageId": 12345,
    "messageType": "image",
    "statusCode": 200,
    "contentType": "image/jpeg",
    "hasBody": true
  }
}
```

### Error Flow: Missing Token

```json
{
  "level": "error",
  "prefix": "[MEDIA-PROXY]",
  "event": "Missing WhatsApp access token",
  "data": {
    "messageId": 12345,
    "messageType": "image",
    "providerMediaId": "1234567890_9876543210...",
    "tokenSource": "none"
  }
}
```

**Response:**
```json
{
  "error": "missing_token",
  "reason": "Missing WhatsApp access token. Configure in /admin/integrations or set WHATSAPP_ACCESS_TOKEN environment variable.",
  "messageId": 12345,
  "stage": "token",
  "status": 500,
  "hint": "Token source: none. Configure token in DB Integration config.accessToken or set WHATSAPP_ACCESS_TOKEN env var."
}
```

### Error Flow: Graph API Failure

```json
{
  "level": "error",
  "prefix": "[MEDIA-PROXY]",
  "event": "Graph API metadata fetch error",
  "data": {
    "messageId": 12345,
    "messageType": "image",
    "providerMediaId": "1234567890_9876543210...",
    "statusCode": 401,
    "errorType": "Error",
    "errorBodySummary": "Invalid OAuth 2.0 Access Token"
  }
}
```

**Response:**
```json
{
  "error": "meta_auth_failed",
  "reason": "Meta auth failed",
  "messageId": 12345,
  "providerMediaId": "1234567890_9876543210...",
  "stage": "metadata",
  "status": 502,
  "hint": "Meta Graph API returned 401. Check token validity. Token source: db"
}
```

### Error Flow: Download Failure

```json
{
  "level": "error",
  "prefix": "[MEDIA-PROXY]",
  "event": "Download fetch error",
  "data": {
    "messageId": 12345,
    "messageType": "image",
    "providerMediaId": "1234567890_9876543210...",
    "statusCode": 403,
    "errorType": "Error",
    "errorBodySummary": "Forbidden"
  }
}
```

**Response:**
```json
{
  "error": "meta_auth_failed",
  "reason": "Meta auth failed",
  "messageId": 12345,
  "providerMediaId": "1234567890_9876543210...",
  "stage": "download",
  "status": 502,
  "hint": "Meta media download returned 403. Check token validity. Token source: db"
}
```

### Error Flow: Missing Media ID

```json
{
  "level": "error",
  "prefix": "[MEDIA-PROXY]",
  "event": "Missing media ID after all recovery attempts",
  "data": {
    "messageId": 12345,
    "messageType": "image",
    "hasProviderMediaId": false,
    "hasMediaUrl": false,
    "hasRawPayload": true,
    "hasPayload": false,
    "hasProviderMessageId": true
  }
}
```

**Response:**
```json
{
  "error": "missing_media_id",
  "reason": "No media id stored",
  "messageId": 12345,
  "type": "image",
  "stage": "message",
  "status": 404,
  "hint": "Media ID not found in message record or recovery sources. Run backfill: POST /api/admin/backfill-media-ids"
}
```

## Error Stages

- `'token'`: Token configuration/retrieval failure
- `'metadata'`: Meta Graph API metadata fetch failure
- `'download'`: Media download stream fetch failure
- `'message'`: Message lookup or media ID recovery failure

## Status Codes

- `404`: Message missing or no media ID found after all recovery attempts
- `500`: Missing WhatsApp access token
- `502`: Meta Graph API or media download returned non-200 status
- `410`: Media expired (special case, handled separately)
- `429`: Rate limit exceeded (special case, handled separately)
