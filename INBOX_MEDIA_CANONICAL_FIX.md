# Inbox Media Canonical Fix

## Summary

Fixed inbound WhatsApp media rendering by making Inbox detection use the SAME canonical system as outbound: providerMediaId (or legacy mediaUrl-as-id) determines media, not only type/mime.

## Files Changed

1. `src/app/api/inbox/conversations/[id]/route.ts` - Added canonical `isMedia()` function and debug log
2. `src/app/api/media/messages/[id]/route.ts` - Enhanced legacy mediaUrl detection (numeric check)
3. `src/app/inbox/page.tsx` - Updated Message type and simplified UI logic to use canonical flags

## Changes Made

### 1. Inbox Conversation API (`src/app/api/inbox/conversations/[id]/route.ts`)

**Added canonical `isMedia()` function (lines 170-192):**
```typescript
const looksLikeWhatsAppMediaId = (v?: string | null): boolean => {
  if (!v) return false
  return /^[0-9]{8,}$/.test(v.trim()) // WhatsApp media IDs are numeric strings
}

const isMedia = (msg: any): boolean => {
  // Priority 1: providerMediaId exists
  if (msg.providerMediaId && msg.providerMediaId.trim() !== '') return true
  
  // Priority 2: mediaUrl exists and looks like WhatsApp media ID (numeric)
  if (looksLikeWhatsAppMediaId(msg.mediaUrl)) return true
  
  // Priority 3: type is in MEDIA_TYPES
  if (msg.type && MEDIA_TYPES.has((msg.type || '').toLowerCase())) return true
  
  // Priority 4: mediaMimeType indicates media
  if (msg.mediaMimeType) {
    const mime = msg.mediaMimeType.toLowerCase()
    if (mime.match(/^(image|audio|video)\//) || mime === 'application/pdf') return true
  }
  
  return false
}
```

**Updated message formatting (lines 194-228):**
- Uses `isMedia(msg)` to compute `msgIsMedia`
- Sets `mediaProxyUrl = msgIsMedia ? \`/api/media/messages/${msg.id}\` : null`
- Sets `hasMedia: msgIsMedia`
- Returns `providerMediaId` explicitly
- Added `[INBOX-MEDIA-CLASSIFY]` debug log (no PII)

### 2. Media Proxy Route (`src/app/api/media/messages/[id]/route.ts`)

**Enhanced PRIORITY B legacy mediaUrl detection (lines 216-235):**
- Checks if `mediaUrl` is numeric (WhatsApp media ID pattern: `/^[0-9]{8,}$/`)
- Falls back to checking if it doesn't start with 'http' or '/'
- More robust detection for legacy messages

### 3. Inbox UI Component (`src/app/inbox/page.tsx`)

**Updated Message type (lines 83-114):**
- Added `providerMediaId?: string | null`
- Changed `mediaRenderable` to `hasMedia?: boolean` (canonical flag)
- Updated comments

**Simplified media detection logic (lines 951-965):**
- Uses canonical `msg.hasMedia || !!msg.mediaProxyUrl || !!msg.providerMediaId`
- Removed complex fallback logic
- Cleaner, more maintainable code

## Final `isMedia()` Logic

The canonical `isMedia()` function checks (in priority order):
1. `providerMediaId` exists
2. `mediaUrl` looks like WhatsApp media ID (numeric string `/^[0-9]{8,}$/`)
3. `type` is in `MEDIA_TYPES` (`['image','document','audio','video','sticker']`)
4. `mediaMimeType` matches `image/`, `audio/`, `video/`, or is `application/pdf`

## Where `isMedia()` is Used

1. **Inbox Conversation API** (`src/app/api/inbox/conversations/[id]/route.ts`, line 171):
   - Computes `msgIsMedia = isMedia(msg)`
   - Sets `mediaProxyUrl` and `hasMedia` flags
   - Used in message formatting

2. **Inbox UI Component** (`src/app/inbox/page.tsx`, line 953):
   - Uses `msg.hasMedia || !!msg.mediaProxyUrl || !!msg.providerMediaId`
   - Determines whether to render `MediaMessage` component

## Component Updated

**`MediaMessage.tsx`** - No changes needed. It already:
- Uses `message.mediaProxyUrl` if provided
- Falls back to `/api/media/messages/${message.id}` if not
- Handles errors gracefully (shows "Not a media message" for 422 errors)

The "Not a media message" error is now only shown when:
- The proxy route returns 422 (not a media type)
- AND `hasMedia`, `mediaProxyUrl`, and `providerMediaId` are all missing/false

## Acceptance Criteria

✅ If an inbound message has `providerMediaId` (or numeric `mediaUrl`), the inbox must show media (no "Not a media message")
- ✅ `isMedia()` checks `providerMediaId` first
- ✅ `isMedia()` checks if `mediaUrl` is numeric (WhatsApp media ID pattern)
- ✅ UI uses `msg.hasMedia || !!msg.mediaProxyUrl || !!msg.providerMediaId`

✅ Outbound behavior unchanged
- ✅ `isMedia()` logic works for both inbound and outbound messages
- ✅ No changes to outbound message creation

✅ No dependency on `mediaMimeType` being present
- ✅ `isMedia()` checks `providerMediaId` and `mediaUrl` first
- ✅ `mediaMimeType` is only used as a fallback

✅ `/api/media/messages/:id` continues to fetch bytes from provider normally
- ✅ Proxy route logic unchanged (only enhanced legacy mediaUrl detection)
- ✅ All recovery mechanisms still work
