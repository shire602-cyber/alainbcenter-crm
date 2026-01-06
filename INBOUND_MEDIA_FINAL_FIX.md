# Inbound WhatsApp Media Final Fix

## Summary

Fixed inbound WhatsApp media rendering to use the exact same system as outbound: correct media type + providerMediaId always stored, with full sticker support and consistent metadata passed into the pipeline.

## Files Changed

1. `src/app/api/webhooks/whatsapp/route.ts` - Updated to use `finalType` consistently throughout

## Changes Made

### 1. Define `finalType` (canonical type)

**Lines 497, 516-520:**
- ✅ Expanded `hasMediaObjects` to include stickers:
  ```typescript
  const hasMediaObjects = !!(message.audio || message.image || message.document || message.video || message.sticker)
  ```
- ✅ Verified `MEDIA_TYPES` includes all types: `['image','document','audio','video','sticker']` (from `src/lib/media/extractMediaId.ts`)
- ✅ Defined `finalType` after `actualMediaType`/`isMediaMessage`:
  ```typescript
  const finalType = isMediaMessage ? actualMediaType : messageType
  ```

### 2. Replace ALL uses of `detectedType` with `finalType`

**Lines 533-691:**
- ✅ Set `messageType = finalType` immediately in `if (isMediaMessage)` block (line 533)
- ✅ Extraction start log uses `finalType` (line 536)
- ✅ `extractMediaInfo(message, finalType)` (line 556)
- ✅ Message text assignment uses `finalType` with capital letters (lines 648-658):
  - `image` -> `'[Image]'`
  - `audio` -> `'[Audio]'`
  - `document` -> `'[Document]'`
  - `video` -> `'[Video]'`
  - `sticker` -> `'[Sticker]'`
- ✅ `[INGEST-MEDIA]` log uses `finalType` (line 662)
- ✅ "missing providerMediaId" error log uses `finalType` (line 673)
- ✅ "has providerMediaId" success log uses `finalType` (line 687)
- ✅ Audio transcription condition uses `finalType === 'audio'` (line 691)
- ✅ Direct extraction uses `message[finalType]` (line 859)
- ✅ All error logs use `finalType` (line 892)

### 3. Fix two logic bugs

**Lines 516-517, 770:**
- ✅ `isMediaMessage` uses `actualMediaType` (not `detectedType`):
  ```typescript
  const isMediaMessage = hasMediaObjects || MEDIA_TYPES.has(actualMediaType)
  ```
- ✅ `isMediaType` check uses `finalType` (not `messageType`):
  ```typescript
  const isMediaType = MEDIA_TYPES.has(finalType)
  ```

### 4. Pipeline inputs aligned with finalType + finalProviderMediaId

**Lines 555-564, 853-871, 961-964:**
- ✅ `finalProviderMediaId` computed from `extractMediaInfo` first (line 558)
- ✅ Fallback: If missing, scans `allMediaObjects` for first available `obj.id` (lines 567-624)
- ✅ Additional fallback: If still null, extracts directly from `message[finalType]` (lines 858-871)
- ✅ Passed to `handleInboundMessageAutoMatch`:
  - `metadata.messageType = finalType` (line 961)
  - `metadata.providerMediaId = finalProviderMediaId` (line 963)
  - `metadata.mediaUrl = finalProviderMediaId` (line 964, legacy compatibility)
- ✅ DB message row type uses `finalType` (via `messageType = finalType` at line 533, passed to pipeline)

### 5. Sticker support everywhere

**Lines 497, 542, 547, 576, 598, 657, 680, 683, 786:**
- ✅ Included in `hasMediaObjects` (line 497)
- ✅ Included in extraction logs (line 542: `hasSticker`, line 547: `stickerKeys`, line 552: `stickerObject`)
- ✅ Included in `allMediaObjects` fallback list (line 576)
- ✅ Default MIME type: `image/webp` for sticker (line 598)
- ✅ Message text: `'[Sticker]'` (line 657)
- ✅ Included in error logs (line 680: `hasSticker`, line 683: `stickerKeys`)
- ✅ Included in payload logging (line 786: `stickerObject`)

### 6. Definitive debug log

**Line 946:**
- ✅ Added log right before pipeline call:
  ```typescript
  console.log('[INBOUND-MEDIA-FINAL]', { messageId, finalType, providerMediaId: finalProviderMediaId, hasMediaObjects, originalType: message.type })
  ```

## Line/Section Updates

1. **Lines 497**: Expanded `hasMediaObjects` to include `message.sticker`
2. **Lines 516-520**: Added `isMediaMessage` using `actualMediaType` and defined `finalType`
3. **Line 533**: Set `messageType = finalType` immediately in media branch
4. **Lines 536-553**: Extraction start log uses `finalType` (added sticker logging)
5. **Line 556**: `extractMediaInfo(message, finalType)` uses `finalType`
6. **Lines 571-576**: `allMediaObjects` includes sticker
7. **Lines 592-598**: MIME type defaults include sticker (`image/webp`)
8. **Lines 633, 648-658**: Message text uses `finalType` with capital letters
9. **Line 662**: `[INGEST-MEDIA]` log uses `finalType`
10. **Lines 673-684**: Error log uses `finalType` (added sticker logging)
11. **Line 687**: Success log uses `finalType`
12. **Line 691**: Audio transcription uses `finalType === 'audio'`
13. **Line 770**: `isMediaType` check uses `finalType`
14. **Lines 775, 779**: Payload logging uses `finalType` consistently
15. **Line 859**: Direct extraction uses `message[finalType]`
16. **Line 892**: Error log uses `finalType`
17. **Line 946**: Added `[INBOUND-MEDIA-FINAL]` log
18. **Lines 961, 963-964**: Pipeline inputs use `finalType` and `finalProviderMediaId`

## Constants/Helpers

- ✅ `MEDIA_TYPES`: Already includes all 5 types (`['image','document','audio','video','sticker']`)
- ✅ `allMediaObjects`: Array includes all 5 media types with sticker
- ✅ MIME type defaults: Include `image/webp` for sticker

## Acceptance Criteria

✅ For inbound image/pdf/audio/video/sticker, the created Message row has:
- `type` in `['image','document','audio','video','sticker']`
- `providerMediaId` NOT NULL

✅ Inbox renders inbound media via `/api/media/messages/:id` (same as outbound)

✅ No media logs reference `detectedType`; only `finalType`

✅ Lint/build passes

All changes complete!
