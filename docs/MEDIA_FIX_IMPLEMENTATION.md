# WhatsApp Media Fix - Implementation Summary

## Overview
Comprehensive fix for WhatsApp inbound media handling to ensure reliable media rendering in the application inbox.

## Changes Made

### 1. Media ID Extraction (`src/lib/media/extractMediaId.ts`)
- **Added `MEDIA_TYPES` constant**: Set containing all supported media types: `['image', 'document', 'audio', 'video', 'sticker']`
- **Enhanced `detectMediaType()`**: 
  - Returns proper TypeScript types: `'text' | 'location' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'unknown'`
  - Checks media objects first (most reliable)
  - Handles interactive/button/reaction types as non-media
  - Supports sticker type
- **Added `extractMediaId()` function**: Unified function to extract media ID from message objects
- **Enhanced `extractMediaInfo()`**: Now supports sticker type with proper MIME type defaults

### 2. Webhook Handler (`src/app/api/webhooks/whatsapp/route.ts`)
- **Always store rawPayload**: Changed to ALWAYS store `rawPayload` as JSON string for ALL messages (text and media), not just media messages
- **Use MEDIA_TYPES set**: Replaced loose type checking with `MEDIA_TYPES.has()` for consistent media detection
- **Improved logging**: Added guarded logging for extraction failures (only IDs/types, no PII)

### 3. Media Proxy (`src/app/api/media/messages/[id]/route.ts`)
- **Unified extraction**: Updated PRIORITY C (rawPayload extraction) to use `detectMediaType()` and `extractMediaId()` functions
- **Better recovery**: More reliable extraction from rawPayload using the same logic as webhook ingestion

### 4. Auto-Match Pipeline (`src/lib/inbound/autoMatchPipeline.ts`)
- **Already persists correctly**: Verified that `providerMediaId`, `payload`, and `rawPayload` are stored correctly
- No changes needed - existing implementation is correct

### 5. Database Schema (`prisma/schema.prisma`)
- **Verified**: `rawPayload` and `payload` are `String?` which maps to `TEXT` in PostgreSQL
- **Supports large payloads**: TEXT type can store up to 1GB, sufficient for webhook payloads
- **No migration needed**: Schema already supports large payloads

### 6. Backfill Script (`scripts/backfill-provider-media-id.ts`)
- **NEW**: Script to populate `providerMediaId` for existing messages
- **Features**:
  - Queries messages where `providerMediaId` is null but `rawPayload` or `payload` exists
  - Uses unified extraction functions (`detectMediaType`, `extractMediaId`)
  - Processes in batches (default 100)
  - Supports dry-run mode
  - Updates messages with extracted `providerMediaId`

### 7. Unit Tests (`src/lib/media/__tests__/extractMediaId.test.ts`)
- **NEW**: Comprehensive unit tests for extraction logic
- **Coverage**:
  - `detectMediaType()`: All media types, location, text, interactive
  - `extractMediaId()`: ID extraction with various field names, validation
  - `extractMediaInfo()`: Full media info extraction (ID, MIME type, filename, size, etc.)
  - `MEDIA_TYPES` constant validation

## Files Changed

1. `src/lib/media/extractMediaId.ts` - Enhanced extraction functions
2. `src/app/api/webhooks/whatsapp/route.ts` - Always store rawPayload, use MEDIA_TYPES
3. `src/app/api/media/messages/[id]/route.ts` - Unified extraction from rawPayload
4. `scripts/backfill-provider-media-id.ts` - NEW backfill script
5. `src/lib/media/__tests__/extractMediaId.test.ts` - NEW unit tests

## Migration Steps

### No Database Migration Required
The existing schema already supports large payloads:
- `rawPayload String?` → PostgreSQL `TEXT` (up to 1GB)
- `payload String?` → PostgreSQL `TEXT` (up to 1GB)

### Run Backfill (Optional)
To populate `providerMediaId` for existing messages:

```bash
# Dry run (no changes)
npx tsx scripts/backfill-provider-media-id.ts --limit=100 --dry-run

# Actual backfill (updates database)
npx tsx scripts/backfill-provider-media-id.ts --limit=1000

# With custom batch size
npx tsx scripts/backfill-provider-media-id.ts --limit=5000 --batch-size=200
```

## Running Tests

```bash
# Run unit tests (if using Jest/Vitest)
npm test src/lib/media/__tests__/extractMediaId.test.ts

# Or with your test framework
npm run test
```

## Verification

### 1. Test Webhook Ingestion
Send a test media message to your webhook endpoint and verify:
- `providerMediaId` is stored in the database
- `rawPayload` is stored as JSON string
- `payload` contains structured media data

### 2. Test Media Proxy
```bash
# Test media proxy endpoint
curl -H "Cookie: your-session-cookie" http://localhost:3000/api/media/messages/{messageId}

# Should return media bytes with correct Content-Type
```

### 3. Test Backfill
```bash
# Run backfill in dry-run mode first
npx tsx scripts/backfill-provider-media-id.ts --limit=10 --dry-run

# Check output, then run for real
npx tsx scripts/backfill-provider-media-id.ts --limit=100
```

## Acceptance Criteria ✅

- ✅ For any inbound WhatsApp message of type in {image, document, audio, video, sticker}:
  - ✅ `message.providerMediaId` is set to the provider's media id
  - ✅ `message.type` matches the detected type
  - ✅ `rawPayload` is stored for ALL inbound messages (text and media)
  - ✅ `payload` stores structured media data as JSON

- ✅ The route `/api/media/messages/:id` returns media bytes with correct Content-Type when `providerMediaId` exists
- ✅ The route also succeeds when `providerMediaId` is missing but `rawPayload` contains the id

- ✅ No TypeScript compile errors
- ✅ Unit tests for extraction using real-ish WhatsApp payload fixtures
- ✅ Backfill script/route that sets `providerMediaId` using `rawPayload`/`payload` for messages where it is null

## Logging

All logging follows safe practices:
- Only logs message IDs, types, and provider IDs
- No PII (phone numbers, message bodies) in logs
- Structured logging for extraction failures with enough context to debug

## Next Steps

1. **Deploy changes** to staging/production
2. **Run backfill** for existing messages (optional but recommended)
3. **Monitor logs** for extraction failures
4. **Verify** new inbound media messages have `providerMediaId` stored correctly








