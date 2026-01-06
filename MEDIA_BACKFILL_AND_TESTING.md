# Media Backfill and Testing - Implementation Summary

## Summary

Completed backfill, testing, and guardrails to ensure media rendering reliability. Updated backfill route to use extraction functions, added comprehensive unit tests with realistic WhatsApp fixtures, and created a health check endpoint.

## Changes Made

### 1. Backfill Route Updates

**File**: `src/app/api/admin/backfill-media-ids/route.ts`

**Changes**:
- ✅ Uses `detectMediaType()` and `extractMediaInfo()` from `@/lib/media/extractMediaId` for reliable extraction
- ✅ Supports dry-run mode via `?dryRun=true` query parameter
- ✅ Supports cursor pagination via `?cursor=ID` query parameter
- ✅ Supports batch size limit via `?limit=N` query parameter (default: 100, max: 1000)
- ✅ Handles multiple rawPayload structures:
  - Direct message object: `{ audio: { id: '...' }, ... }`
  - Wrapped in entry: `{ entry: [{ changes: [{ value: { messages: [{...}] } }] }] }`
  - Wrapped message: `{ message: { audio: { id: '...' }, ... } }`
- ✅ Extracts from `payload.media.id` (structured format) and legacy payload fields
- ✅ Falls back to `mediaUrl` if it's a media ID (not a URL)
- ✅ Extracts `mediaCaption` from payload
- ✅ Batch updates with error tracking

**Query Parameters**:
- `dryRun` (boolean): If true, don't update (default: false)
- `limit` (number): Batch size (default: 100, max: 1000)
- `cursor` (number): Message ID to start from (for pagination)

**Response Format**:
```json
{
  "total": 100,
  "updated": 95,
  "cannotBackfill": 5,
  "errors": [...],
  "dryRun": false,
  "nextCursor": 12345,
  "message": "Updated 95 messages. 5 messages cannot be backfilled..."
}
```

### 2. Enhanced Unit Tests

**File**: `src/lib/media/__tests__/extractMediaId.test.ts`

**Added Tests**:
- ✅ Realistic WhatsApp webhook fixtures for all media types (image, document, audio, video, sticker)
- ✅ Tests for `extractMediaInfo()` with complete metadata (mime_type, filename, file_size, sha256, caption)
- ✅ Tests for missing optional fields (graceful handling)
- ✅ Tests for trying all media objects when specified type not found
- ✅ All media types covered: image, document, audio, video, sticker

**Test Coverage**:
- `detectMediaType()`: 9 tests
- `extractMediaId()`: 8 tests
- `extractMediaInfo()`: 10 tests (including realistic fixtures)
- `MEDIA_TYPES`: 1 test

### 3. Admin Health Check Endpoint

**File**: `src/app/api/admin/whatsapp-media-health/route.ts` (New File)

**Features**:
- ✅ Reports token source (env/db/none) and token presence
- ✅ Reports phone number ID presence
- ✅ Optional media fetch test (via `?testMediaId=ID` query parameter)
- ✅ Stats on messages with missing providerMediaId (by type)
- ✅ Actionable recommendations

**Query Parameters**:
- `testMediaId` (string, optional): Media ID to test fetch

**Response Format**:
```json
{
  "ok": true,
  "configuration": {
    "tokenPresent": true,
    "tokenSource": "db",
    "phoneNumberIdPresent": true
  },
  "mediaTest": {
    "success": true,
    "hasUrl": true,
    "mimeType": "image/jpeg",
    "fileSize": 12345,
    "sha256": "..."
  },
  "stats": {
    "messagesWithMissingProviderMediaId": 5,
    "byType": [
      { "type": "image", "count": 3 },
      { "type": "audio", "count": 2 }
    ]
  },
  "recommendations": [
    "Run backfill to fix 5 messages with missing providerMediaId: POST /api/admin/backfill-media-ids"
  ]
}
```

### 4. Runtime Guardrails

**File**: `src/lib/inbound/autoMatchPipeline.ts` (line 1406)

**Status**: ✅ Already implemented
- Logs ERROR when media message has null providerMediaId
- Includes messageId, type, and metadata keys for debugging
- Still creates message (proxy can recover from rawPayload)

**Example Log**:
```
❌ [AUTO-MATCH] CRITICAL: Storing media message wamid.XXX with NULL providerMediaId!
{
  messageType: 'image',
  hasMediaUrl: false,
  hasRawPayload: true,
  hasPayload: false,
  metadataProviderMediaId: 'NULL',
  ...
}
```

## Files Changed

1. **`src/app/api/admin/backfill-media-ids/route.ts`**
   - Refactored to use `detectMediaType()` and `extractMediaInfo()`
   - Added dry-run, cursor pagination, batch limits
   - Enhanced extraction from rawPayload/payload/mediaUrl
   - Added error tracking

2. **`src/lib/media/__tests__/extractMediaId.test.ts`**
   - Added realistic WhatsApp webhook fixtures
   - Added comprehensive tests for `extractMediaInfo()`
   - Added tests for all media types (image, document, audio, video, sticker)

3. **`src/app/api/admin/whatsapp-media-health/route.ts`** (New File)
   - Health check endpoint for WhatsApp media configuration
   - Optional media fetch test
   - Stats and recommendations

## How to Use

### Backfill Command

**Dry Run (Preview)**:
```bash
curl -X POST "http://localhost:3000/api/admin/backfill-media-ids?dryRun=true&limit=100" \
  -H "Cookie: alaincrm_session=YOUR_SESSION"
```

**Actual Backfill (First Batch)**:
```bash
curl -X POST "http://localhost:3000/api/admin/backfill-media-ids?limit=100" \
  -H "Cookie: alaincrm_session=YOUR_SESSION"
```

**Pagination (Next Batch)**:
```bash
curl -X POST "http://localhost:3000/api/admin/backfill-media-ids?limit=100&cursor=12345" \
  -H "Cookie: alaincrm_session=YOUR_SESSION"
```

**Full Backfill Script**:
```bash
#!/bin/bash
CURSOR=""
SESSION="YOUR_SESSION"
BASE_URL="http://localhost:3000"

while true; do
  if [ -z "$CURSOR" ]; then
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/backfill-media-ids?limit=100" \
      -H "Cookie: alaincrm_session=$SESSION")
  else
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/backfill-media-ids?limit=100&cursor=$CURSOR" \
      -H "Cookie: alaincrm_session=$SESSION")
  fi
  
  UPDATED=$(echo "$RESPONSE" | jq -r '.updated')
  NEXT_CURSOR=$(echo "$RESPONSE" | jq -r '.nextCursor // empty')
  
  echo "Updated: $UPDATED, Next cursor: $NEXT_CURSOR"
  
  if [ -z "$NEXT_CURSOR" ] || [ "$UPDATED" -eq 0 ]; then
    break
  fi
  
  CURSOR="$NEXT_CURSOR"
done
```

### Health Check

**Basic Health Check**:
```bash
curl "http://localhost:3000/api/admin/whatsapp-media-health" \
  -H "Cookie: alaincrm_session=YOUR_SESSION"
```

**Health Check with Media Test**:
```bash
curl "http://localhost:3000/api/admin/whatsapp-media-health?testMediaId=123456789" \
  -H "Cookie: alaincrm_session=YOUR_SESSION"
```

### Run Tests

**All Tests**:
```bash
npm test
```

**Unit Tests Only**:
```bash
npm test -- src/lib/media/__tests__/extractMediaId.test.ts
```

**Test with Coverage**:
```bash
npm run test:coverage
```

**Test UI**:
```bash
npm run test:ui
```

## Environment Variables

No new environment variables required. The backfill uses existing database credentials and the health check uses existing WhatsApp credentials.

**Optional** (for testing):
- `MEDIA_PROXY_TEST_KEY`: Test key for media proxy (default: 'test123')

## Acceptance Criteria

✅ **Backfill updates existing records so media loads in inbox for past messages**
- ✅ Backfill route uses extraction functions for reliable extraction
- ✅ Supports pagination for large datasets
- ✅ Dry-run mode for safe preview
- ✅ Extracts from rawPayload/payload/mediaUrl

✅ **Tests pass and cover the previously failing cases**
- ✅ Unit tests for `detectMediaType()` with all media types
- ✅ Unit tests for `extractMediaInfo()` with realistic WhatsApp fixtures
- ✅ Tests cover image, document, audio, video, sticker
- ✅ Tests cover missing optional fields

✅ **Clear operator instructions exist**
- ✅ This document provides backfill commands
- ✅ Health check endpoint provides recommendations
- ✅ Query parameters documented

## Runtime Guardrails

✅ **Runtime assertions already implemented**:
- ✅ `autoMatchPipeline.ts` logs ERROR when media message has null providerMediaId
- ✅ Includes messageId, type, and metadata for debugging
- ✅ Message still created (proxy can recover from rawPayload)

**Note**: Runtime guardrails are implemented as logging (not assertions that stop execution) to avoid blocking message creation. The proxy can recover from rawPayload even if providerMediaId is missing.

## Verification

### Check Backfill Status

```sql
-- Count messages with missing providerMediaId
SELECT type, COUNT(*) as count
FROM "Message"
WHERE "providerMediaId" IS NULL
  AND (type IN ('image', 'document', 'audio', 'video', 'sticker')
       OR "mediaMimeType" IS NOT NULL)
GROUP BY type;

-- Check recent backfilled messages
SELECT id, type, "providerMediaId", "mediaMimeType", "mediaFilename"
FROM "Message"
WHERE "providerMediaId" IS NOT NULL
  AND "updatedAt" > NOW() - INTERVAL '1 hour'
ORDER BY "updatedAt" DESC
LIMIT 10;
```

### Test Health Check

1. **Check configuration**:
   ```bash
   curl "http://localhost:3000/api/admin/whatsapp-media-health"
   ```

2. **Test media fetch** (replace with actual media ID):
   ```bash
   curl "http://localhost:3000/api/admin/whatsapp-media-health?testMediaId=123456789"
   ```

3. **Verify recommendations**:
   - If `messagesWithMissingProviderMediaId > 0`, run backfill
   - If `tokenPresent: false`, configure WhatsApp credentials

## Next Steps

1. **Run backfill** on production data (start with dry-run)
2. **Monitor logs** for runtime guardrail warnings
3. **Check health endpoint** regularly for configuration issues
4. **Run tests** in CI/CD pipeline

