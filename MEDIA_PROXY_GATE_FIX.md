# Media Proxy Gate Fix

## Summary

Fixed inbound media rendering by correcting the media-proxy gate: `/api/media/messages/:id` now treats `providerMediaId` (or numeric legacy `mediaUrl`) as definitive proof a message is media, even if type is 'text' and mime/rawPayload/body are missing.

## Files Changed

1. `src/app/api/media/messages/[id]/route.ts` - Updated gate logic to prioritize `hasMediaId`

## Changes Made

### 1. Added `looksLikeWhatsAppMediaId` helper and `hasMediaId` computation (lines 115-123)

```typescript
// Canonical media ID detection helper
const looksLikeWhatsAppMediaId = (v?: string | null): boolean => {
  if (!v) return false
  return /^[0-9]{8,}$/.test(v.trim())
}

// Check if message has providerMediaId or numeric mediaUrl (definitive proof it's media)
const hasMediaId =
  !!message.providerMediaId?.trim() ||
  looksLikeWhatsAppMediaId(message.mediaUrl)
```

### 2. Expanded media detection fallbacks to include stickers

- **`isMediaByPayload`** (line 139): Added `rawPayload.sticker` to the check
- **`hasMediaPlaceholder` regex** (line 148): Added `sticker` to the pattern: `/\[(audio|image|video|document|sticker|Audio received)\]/i`

### 3. Updated 422/424 logic to account for `hasMediaId`

- **422 check** (line 177): Added `&& !hasMediaId` to prevent returning 422 if `hasMediaId` is true
- **424 check** (line 152): Added `&& !hasMediaId` to prevent returning 424 if `hasMediaId` is true

**Rationale**: If we already have `providerMediaId`/`mediaUrl`-id, it is NOT "missing metadata" and NOT "not media".

### 4. Added debug log when `hasMediaId` rescued classification (lines 206-212)

```typescript
// Debug log when hasMediaId rescued the classification (no PII)
if (!isMediaByType && !isMediaByMime && !isMediaByPayload && hasMediaId) {
  console.warn('[MEDIA-PROXY] Message classified as media via providerMediaId/mediaUrl despite type/mime missing', {
    messageId,
    type: message.type,
    hasProviderMediaId: !!message.providerMediaId,
    hasNumericMediaUrl: looksLikeWhatsAppMediaId(message.mediaUrl),
  })
}
```

### 5. Updated PRIORITY B to use `looksLikeWhatsAppMediaId` only (line 232)

Changed from:
```typescript
if (looksLikeMediaId || (!mediaUrl.startsWith('http') && !mediaUrl.startsWith('/'))) {
```

To:
```typescript
if (looksLikeWhatsAppMediaId(mediaUrl)) {
```

This ensures we only treat `mediaUrl` as `providerMediaId` if it's numeric (WhatsApp media ID pattern), avoiding accidental URLs.

## Logic Flow

1. Fetch message from DB
2. Compute `hasMediaId` = `providerMediaId` exists OR `mediaUrl` is numeric
3. Check media indicators: `isMediaByType`, `isMediaByMime`, `isMediaByPayload`, `hasMediaPlaceholder`, `hasMediaId`
4. Early returns:
   - **424**: Only if `hasMediaPlaceholder` AND no other indicators AND `!hasMediaId`
   - **422**: Only if NO indicators at all AND `!hasMediaId`
5. If passed gates, recover `providerMediaId` using priority system

## Acceptance Criteria

✅ Inbound messages that have `providerMediaId` (but type='text' and no mime/body/rawPayload) no longer return 422
- `hasMediaId` is computed before gate checks
- 422 check includes `&& !hasMediaId`
- 424 check includes `&& !hasMediaId`

✅ UI no longer shows "Not a media message" for inbound media that has `providerMediaId` or numeric `mediaUrl`
- Gate logic now treats `hasMediaId` as definitive proof

✅ Outbound behavior unchanged
- Logic only affects early gate checks, not providerMediaId recovery
- Recovery priorities unchanged
