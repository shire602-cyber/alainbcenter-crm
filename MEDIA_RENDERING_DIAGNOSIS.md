# WhatsApp Media Rendering Failure - Diagnosis Report

## Executive Summary

This report documents the WhatsApp media rendering flow, failure modes, and instrumentation added for debugging. The media proxy route (`/api/media/messages/[id]`) now includes structured logging to identify the exact failure point.

## Flow Overview

1. **UI Request** → `MediaMessage.tsx` component requests `/api/media/messages/:id`
2. **Media Proxy** → `/api/media/messages/[id]/route.ts`:
   - Fetches message from database
   - Recovers `providerMediaId` (Priority A-E recovery)
   - Gets WhatsApp access token (DB or ENV)
   - Calls Meta Graph API: `GET /v21.0/{mediaId}` to get download URL
   - Streams media from Meta download URL to client
3. **UI Rendering** → `MediaMessage.tsx` displays image/video/audio/document

## Failure Modes

### 1. Missing Media ID (404)
**Error**: `404 - "No media id stored"`

**When it fails**:
- Message has no `providerMediaId` field
- All recovery attempts (Priority A-E) fail:
  - Priority A: `message.providerMediaId` is empty
  - Priority B: `message.mediaUrl` is empty or looks like a URL
  - Priority C: Cannot extract from `rawPayload`
  - Priority D: Cannot extract from `payload`
  - Priority E: Cannot find in `ExternalEventLog`

**Required message fields** (at least one must be present):
- `providerMediaId` (preferred)
- `mediaUrl` (legacy, must not be a URL)
- `rawPayload` (with media object containing `id`)
- `payload` (with media metadata)
- `providerMessageId` (for ExternalEventLog lookup)

**Most likely root cause**: Messages received before metadata capture was enabled, or webhook processing failed to extract media ID.

---

### 2. Missing Access Token (500)
**Error**: `500 - "Missing WhatsApp access token"`

**When it fails**:
- No token found in Integration table (`name='whatsapp'`)
- No token in environment variables (`WHATSAPP_ACCESS_TOKEN` or `META_ACCESS_TOKEN`)

**Required DB/ENV settings**:
- **Database** (preferred):
  - Integration row: `name='whatsapp'`
  - Token in one of: `config.accessToken`, `config.access_token`, `accessToken`, `apiKey`
- **Environment** (fallback):
  - `WHATSAPP_ACCESS_TOKEN` OR
  - `META_ACCESS_TOKEN`

**Most likely root cause**: Integration not configured in database, or environment variable not set.

---

### 3. Meta Auth Failed (502)
**Error**: `502 - "Meta auth failed"`

**When it fails**:
- Graph API returns `401 Unauthorized` or `403 Forbidden`
- Token is present but invalid/expired/revoked

**Required DB/ENV settings**: Same as #2, but token must be valid.

**Most likely root cause**: 
- Token expired (temporary tokens expire after ~60 days)
- Token revoked in Meta Developer Dashboard
- Token has insufficient permissions
- Wrong token (from wrong app/business account)

---

### 4. Media Expired (410)
**Error**: `410 - "Media URL expired. Ask customer to resend."`

**When it fails**:
- Meta Graph API returns `410 Gone`
- Media ID is valid but media has expired on Meta's servers

**Required message fields**: `providerMediaId` must be present and valid.

**Most likely root cause**: Media on Meta's servers expires after a certain period (typically hours/days).

---

### 5. Rate Limit (429)
**Error**: `429 - "Rate limited by Meta API. Please try again later."`

**When it fails**:
- Meta Graph API returns `429 Too Many Requests`
- Too many requests to Meta API in short time

**Required message fields**: `providerMediaId` must be present.

**Most likely root cause**: High traffic or burst of media requests.

---

### 6. Graph API Error (502)
**Error**: `502 - "Failed to fetch media URL from Meta Graph API"` or `"Failed to download media from Meta"`

**When it fails**:
- Graph API returns non-200, non-401, non-403, non-410, non-429 status
- Network errors
- Meta API is down

**Required message fields**: `providerMediaId` must be present.

**Most likely root cause**: 
- Meta API temporary outage
- Network connectivity issues
- Invalid media ID format

---

## Single Most Likely Root Cause

**Missing `providerMediaId` in message records** (404 error).

**Reasoning**:
1. The code has extensive recovery logic (Priority A-E), suggesting this is a known issue
2. Messages received before metadata capture was enabled won't have `providerMediaId`
3. Webhook processing failures could miss extracting the media ID
4. This is the most common failure based on error handling patterns in the code

**Secondary causes** (in order of likelihood):
1. Missing/invalid access token (500/502 errors)
2. Expired media on Meta's servers (410 errors)
3. Token expired/revoked (502 auth errors)

---

## Required Environment/Database Settings

### Database (Integration Table)

```sql
-- Check if WhatsApp integration exists
SELECT name, "isEnabled", provider, "accessToken", "apiKey", config
FROM "Integration"
WHERE name = 'whatsapp';

-- Expected result:
-- name: 'whatsapp'
-- isEnabled: true (optional but recommended)
-- config: JSON with 'accessToken' or 'access_token' key
-- OR accessToken/apiKey field populated
```

**Token location (checked in order)**:
1. `config.accessToken` (JSON field)
2. `config.access_token`
3. `config.token`
4. `config.whatsappToken`
5. `config.metaToken`
6. `accessToken` (direct field)
7. `apiKey` (direct field)

### Environment Variables (Fallback)

```bash
# Check if token is set (do NOT print the value)
echo "WHATSAPP_ACCESS_TOKEN: $([ -n "$WHATSAPP_ACCESS_TOKEN" ] && echo "SET" || echo "NOT SET")"
echo "META_ACCESS_TOKEN: $([ -n "$META_ACCESS_TOKEN" ] && echo "SET" || echo "NOT SET")"
```

**Only one needs to be set** (checked in order):
1. `WHATSAPP_ACCESS_TOKEN`
2. `META_ACCESS_TOKEN`

---

## Missing Message Fields That Cause Failures

### Critical Fields (at least one must be present for media recovery):

1. **`providerMediaId`** (Priority A) - Primary field
   - Type: string
   - Example: `"123456789"` (WhatsApp media ID from Meta)
   - Required for: Direct media fetch (fastest path)

2. **`mediaUrl`** (Priority B) - Legacy field
   - Type: string
   - Example: `"123456789"` (if it's a media ID, not a URL)
   - Required for: Legacy compatibility (if it's a media ID, not a URL)

3. **`rawPayload`** (Priority C) - Webhook payload
   - Type: JSON object or string
   - Must contain: Media object with `id` field (e.g., `{audio: {id: "123"}}`)
   - Required for: Recovery from webhook payload

4. **`payload`** (Priority D) - Structured metadata
   - Type: JSON object or string
   - Must contain: `media.id`, `mediaId`, `media_id`, or `id` field
   - Required for: Recovery from structured metadata

5. **`providerMessageId`** (Priority E) - External event log lookup
   - Type: string
   - Example: `"wamid.XXX"`
   - Required for: ExternalEventLog query to find media ID

### Supporting Fields (for media type detection):

- `type`: Message type (`'image'`, `'video'`, `'audio'`, `'document'`)
- `mediaMimeType`: MIME type (e.g., `'image/jpeg'`, `'video/mp4'`)
- `body`: May contain media placeholders like `[image]`, `[audio]`, etc.

---

## Instrumentation Added

### Structured Logs (No PII)

All logs are prefixed with `[MEDIA-PROXY]` and include:

1. **Message fetched**:
   ```json
   {
     "messageId": 123,
     "messageType": "image",
     "hasProviderMediaId": true,
     "hasMediaUrl": false,
     "hasRawPayload": true,
     "hasPayload": false,
     "hasProviderMessageId": true
   }
   ```

2. **Token check**:
   ```json
   {
     "messageId": 123,
     "tokenFound": true,
     "tokenSource": "DB"  // or "ENV" or null
   }
   ```

3. **Graph API success**:
   ```json
   {
     "messageId": 123,
     "providerMediaId": "1234567890123456...",  // truncated
     "statusCode": 200
   }
   ```

4. **Graph API error**:
   ```json
   {
     "messageId": 123,
     "providerMediaId": "1234567890123456...",  // truncated
     "statusCode": 401,  // or null if not available
     "errorType": "Error",
     "errorSummary": "Error message truncated to 100 chars..."
   }
   ```

5. **Media stream fetch success**:
   ```json
   {
     "messageId": 123,
     "statusCode": 200
   }
   ```

6. **Media stream fetch error**:
   ```json
   {
     "messageId": 123,
     "statusCode": 401,  // or null if not available
     "errorType": "Error",
     "errorSummary": "Error message truncated to 100 chars..."
   }
   ```

### Explicit Error Responses

- **401/403 from Graph API** → `502 - "Meta auth failed"`
- **Missing token** → `500 - "Missing WhatsApp access token"`
- **Missing media ID** → `404 - "No media id stored"`

---

## Manual Verification Checklist

### 1. Check Integration Row Exists

```sql
-- Run in database
SELECT 
  name, 
  "isEnabled", 
  provider,
  CASE 
    WHEN config IS NOT NULL THEN 'HAS_CONFIG'
    WHEN "accessToken" IS NOT NULL THEN 'HAS_ACCESS_TOKEN'
    WHEN "apiKey" IS NOT NULL THEN 'HAS_API_KEY'
    ELSE 'NO_TOKEN'
  END as token_location
FROM "Integration"
WHERE name = 'whatsapp';
```

**Expected**: Row exists with token in config, accessToken, or apiKey field.

---

### 2. Check Environment Variables (without exposing values)

```bash
# Check if set (don't print values)
if [ -n "$WHATSAPP_ACCESS_TOKEN" ]; then
  echo "✓ WHATSAPP_ACCESS_TOKEN is set (length: ${#WHATSAPP_ACCESS_TOKEN})"
else
  echo "✗ WHATSAPP_ACCESS_TOKEN is NOT set"
fi

if [ -n "$META_ACCESS_TOKEN" ]; then
  echo "✓ META_ACCESS_TOKEN is set (length: ${#META_ACCESS_TOKEN})"
else
  echo "✗ META_ACCESS_TOKEN is NOT set"
fi
```

**Expected**: At least one token is set.

---

### 3. Test Media Proxy Endpoint

```bash
# Replace MESSAGE_ID with an actual message ID that has media
MESSAGE_ID=123

# Test with curl (will return JSON or binary data)
curl -v "http://localhost:3000/api/media/messages/${MESSAGE_ID}" \
  -H "Cookie: alaincrm_session=YOUR_SESSION_COOKIE" \
  2>&1 | grep -E "(HTTP|Content-Type|error|reason)"

# Expected headers for success:
# HTTP/1.1 200 OK
# Content-Type: image/jpeg (or video/mp4, audio/ogg, etc.)
# Content-Disposition: inline; filename="..."

# Expected for failure:
# HTTP/1.1 404 Not Found (or 500, 502, etc.)
# Content-Type: application/json
# {"error": "...", "reason": "..."}
```

---

### 4. Check Message Has Media ID

```sql
-- Replace MESSAGE_ID with actual message ID
SELECT 
  id,
  type,
  "providerMediaId",
  "mediaUrl",
  CASE WHEN "rawPayload" IS NOT NULL THEN 'HAS_RAW_PAYLOAD' ELSE 'NO_RAW_PAYLOAD' END as has_raw_payload,
  CASE WHEN payload IS NOT NULL THEN 'HAS_PAYLOAD' ELSE 'NO_PAYLOAD' END as has_payload,
  "providerMessageId"
FROM "Message"
WHERE id = MESSAGE_ID;
```

**Expected**: At least one of `providerMediaId`, `mediaUrl` (if it's a media ID), `rawPayload`, `payload`, or `providerMessageId` is populated.

---

### 5. Check Logs for Structured Output

```bash
# Watch logs in real-time (adjust log location as needed)
tail -f logs/app.log | grep "\[MEDIA-PROXY\]"

# Or in development:
npm run dev 2>&1 | grep "\[MEDIA-PROXY\]"
```

**Expected**: See structured logs with `messageId`, `tokenFound`, `tokenSource`, `statusCode`, etc.

---

## Files Changed

1. **`src/app/api/media/messages/[id]/route.ts`**
   - Added structured logging for message metadata, token source, Graph API status
   - Changed error responses: 404 for missing media ID, 500 for missing token, 502 for auth failures
   - Added logging for Graph API and media stream fetch operations

2. **`src/lib/media/whatsappMedia.ts`**
   - Enhanced error handling to preserve status codes in error objects
   - Errors now include `status` and `statusCode` properties for logging

---

## Next Steps

1. **Monitor logs** after deployment to identify actual failure modes
2. **Check logs** for messages with `tokenFound: false` → configure integration
3. **Check logs** for messages with `hasProviderMediaId: false` → investigate webhook processing
4. **Check logs** for `statusCode: 401` or `403` → verify/refresh access token
5. **Check logs** for `statusCode: 410` → media expired (expected for old messages)
6. **Check logs** for `statusCode: 429` → rate limiting (may need backoff/queuing)

