# Media Rendering Reliability - Implementation Summary

## Summary

Made targeted improvements to ensure every inbound and outbound WhatsApp media message stores sufficient data for reliable media rendering. Replaced loose media type checks with explicit MEDIA_TYPES set and ensured caption is stored in payload.

## Changes Made

### A) Inbound Messages

#### 1. Replaced Loose Media Type Check with MEDIA_TYPES Set
- **File**: `src/app/api/webhooks/whatsapp/route.ts` (line 758)
- **Change**: Replaced loose check:
  ```typescript
  // Before:
  const isMediaType = messageType === 'audio' || messageType === 'image' || messageType === 'document' || messageType === 'video'
  
  // After:
  const isMediaType = MEDIA_TYPES.has(messageType)
  ```
- **Reason**: Uses explicit MEDIA_TYPES set for consistent checking (includes 'sticker' which was missing)

#### 2. Ensure Caption is Stored in Payload
- **File**: `src/app/api/webhooks/whatsapp/route.ts` (line 949)
- **Change**: Added `mediaCaption: caption` to metadata passed to pipeline
- **File**: `src/lib/inbound/autoMatchPipeline.ts` (line 1068, 1354, 1359)
- **Change**: 
  - Extract caption from metadata: `const mediaCaption = input.metadata?.mediaCaption || null`
  - Store caption in payload: Added `caption: mediaCaption || null` to payloadData
- **Reason**: Caption is extracted but wasn't being stored in payload for recovery

#### 3. rawPayload Storage (Already Correct)
- **Status**: ✅ Already implemented correctly
- **Webhook Route**: Always creates and passes rawPayload (line 886, 937)
- **Pipeline**: Always stores rawPayload in Message record (line 1443)
- **Verification**: rawPayload is stored for ALL inbound messages (text and media)

### B) Outbound Messages

#### Status: ✅ Already Correct
- **File**: `src/app/api/inbox/conversations/[id]/messages/route.ts` (line 359)
- **Implementation**: providerMediaId is stored after upload/send
- **Flow**: 
  1. Upload returns `mediaId` (Meta media ID)
  2. Send uses `mediaId` as `providerMediaId`
  3. Message record stores `providerMediaId` (line 359)
- **Verification**: All required fields stored correctly

### C) DB Schema

#### Status: ✅ Already Correct
- **File**: `prisma/schema.prisma` (lines 406-408)
- **payload**: `String?` - Can store large JSON (works for both SQLite and PostgreSQL)
- **rawPayload**: `String?` - Can store large JSON
- **Migration**: None required (String? supports large JSON)

## Files Changed

1. **`src/app/api/webhooks/whatsapp/route.ts`**
   - Line 758: Replaced loose `isMediaType` check with `MEDIA_TYPES.has(messageType)`
   - Line 949: Added `mediaCaption: caption` to metadata

2. **`src/lib/inbound/autoMatchPipeline.ts`**
   - Line 1068: Extract `mediaCaption` from metadata
   - Line 1354: Store `caption` in payload.media
   - Line 1359: Store `caption` at top level in payload

## Verification

### MEDIA_TYPES Set
- **Location**: `src/lib/media/extractMediaId.ts` (line 235)
- **Definition**: `export const MEDIA_TYPES = new Set(['image', 'document', 'audio', 'video', 'sticker'])`
- **Status**: ✅ Used consistently (now includes all checks)

### rawPayload Storage
- **Status**: ✅ Always stored for ALL inbound messages
- **Webhook Route**: Always creates rawPayload (line 886)
- **Pipeline**: Always stores rawPayload (line 1443)

### Caption Storage
- **Status**: ✅ Now stored in payload
- **Extraction**: Caption extracted via `extractMediaInfo()` (line 554)
- **Storage**: Caption stored in payload.media.caption and payload.caption (lines 1354, 1359)

### DB Write Fields
All required fields are stored:
- ✅ `providerMediaId` (Meta Graph API media ID)
- ✅ `mediaMimeType`
- ✅ `mediaFilename`
- ✅ `payload` (with caption in payload.media.caption and payload.caption)
- ✅ `rawPayload` (full webhook payload)

Note: `mediaCaption` is stored in `payload` (not as a separate column), which is acceptable as:
1. Caption is optional (only for images/videos)
2. Stored in structured payload for easy access
3. No schema migration needed

## Acceptance Criteria

✅ **Newly received inbound media messages have providerMediaId not null**
- Status: ✅ Implemented
- Media extraction is reliable, with fallback to rawPayload if needed
- All media types (image, document, audio, video, sticker) supported

✅ **Newly sent outbound media messages have providerMediaId not null**
- Status: ✅ Implemented
- providerMediaId stored after upload/send (already working)

✅ **rawPayload is populated for inbound text AND media**
- Status: ✅ Implemented
- rawPayload always passed to pipeline and stored in Message record

✅ **No breaking changes to UI**
- Status: ✅ No changes needed
- All changes are internal (data storage only)

## Migration Steps

**None required** - All fields already exist in schema and are being used correctly.

## SQL Verification Queries

### Check inbound media messages have providerMediaId
```sql
SELECT id, type, "providerMediaId", "mediaMimeType", "mediaFilename", 
       "payload" IS NOT NULL as has_payload,
       "rawPayload" IS NOT NULL as has_raw_payload
FROM "Message"
WHERE direction = 'INBOUND' 
  AND type IN ('image', 'document', 'audio', 'video', 'sticker')
ORDER BY "createdAt" DESC
LIMIT 10;
```
Expected: All should have providerMediaId and rawPayload

### Check outbound media messages have providerMediaId
```sql
SELECT id, type, "providerMediaId", "mediaMimeType", "mediaFilename"
FROM "Message"
WHERE direction = 'OUTBOUND' 
  AND type IN ('image', 'document', 'audio', 'video')
ORDER BY "createdAt" DESC
LIMIT 10;
```
Expected: All should have providerMediaId

### Check rawPayload for all inbound messages
```sql
SELECT COUNT(*) as total,
       COUNT("rawPayload") as with_raw_payload,
       COUNT(*) - COUNT("rawPayload") as missing_raw_payload
FROM "Message"
WHERE direction = 'INBOUND' 
  AND "createdAt" > NOW() - INTERVAL '7 days';
```
Expected: All should have rawPayload

### Check caption in payload
```sql
SELECT id, type, 
       "payload"::json->'media'->>'caption' as media_caption,
       "payload"::json->>'caption' as top_level_caption
FROM "Message"
WHERE direction = 'INBOUND' 
  AND type IN ('image', 'video')
  AND "payload" IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 10;
```
Expected: Caption stored in payload.media.caption or payload.caption

