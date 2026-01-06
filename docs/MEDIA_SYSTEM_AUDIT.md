# Media System Audit

## PHASE 0 - AUDIT RESULTS

### A) API Routes
1. **`src/app/api/media/messages/[id]/route.ts`** - Main media proxy (GET/HEAD)
   - Status: COMPLEX - has recovery heuristics, ExternalEventLog scraping
   - Needs: Simplify to deterministic flow

2. **`src/app/api/media/messages/[id]/debug/route.ts`** - Debug endpoint
   - Status: OK - keep for diagnostics

3. **`src/app/api/media/route.ts`** - Unknown purpose
   - Status: REVIEW - may be duplicate

4. **`src/app/api/whatsapp/media/[mediaId]/route.ts`** - Legacy WhatsApp media route
   - Status: DELETE - replaced by `/api/media/messages/[id]`

5. **`src/app/api/debug/media/probe/route.ts`** - Debug probe
   - Status: REVIEW - may be duplicate of debug route

### B) UI Components
1. **`src/components/inbox/MediaMessage.tsx`** - Main media renderer for inbox
   - Status: OK - uses proxy URL correctly
   - Needs: Ensure error handling for all status codes

2. **`src/components/inbox/AudioMessagePlayer.tsx`** - Audio player component
   - Status: OK - uses proxy URL
   - Needs: Ensure error handling

3. **`src/components/leads/ConversationWorkspace.tsx`** - Lead page message renderer
   - Status: REVIEW - may have duplicate media rendering logic

### C) lib Utilities
1. **`src/lib/media/whatsappMedia.ts`** - CANONICAL WhatsApp API helpers
   - Status: ✅ KEEP - this is the canonical implementation
   - Functions: `getWhatsAppDownloadUrl`, `fetchWhatsAppMediaStream`, `getWhatsAppAccessToken`

2. **`src/lib/media/mediaTypeDetection.ts`** - Media type detection
   - Status: ✅ KEEP - centralized detection logic
   - Functions: `isMediaType`, `isMediaMimeType`, `hasMedia`, `detectMediaType`

3. **`src/lib/media/resolveMediaSource.ts`** - Media ID resolver
   - Status: ❌ DELETE - complex recovery heuristics, ExternalEventLog scraping
   - Replace with: Simple deterministic resolver in route.ts

4. **`src/lib/media/extractMediaId.ts`** - Webhook extraction
   - Status: ✅ KEEP - used by webhook handler
   - Functions: `extractMediaInfo`, `detectMediaType`

5. **`src/lib/media/storage.ts`** - Local file cache
   - Status: ✅ KEEP - for Plan B (Layer A doesn't need it yet)

### D) Schema/Migrations
1. **`prisma/schema.prisma`** - Message model fields:
   - `type: String` - message type (text, image, audio, document, video)
   - `mediaMimeType: String?` - MIME type
   - `providerMediaId: String?` - WhatsApp media ID (REQUIRED for Layer A)
   - `mediaFilename: String?` - filename
   - `mediaSize: Int?` - file size
   - `mediaUrl: String?` - DEPRECATED (legacy, may contain media ID)

### E) Duplicates/Conflicts
1. **Multiple resolvers**: `resolveMediaSource.ts` vs inline logic in route.ts
   - Decision: DELETE `resolveMediaSource.ts`, use simple inline logic

2. **Multiple media detection**: Scattered `isMediaType` checks
   - Decision: Use centralized `hasMedia` from `mediaTypeDetection.ts`

3. **Multiple WhatsApp media routes**: `/api/whatsapp/media/[mediaId]` vs `/api/media/messages/[id]`
   - Decision: DELETE `/api/whatsapp/media/[mediaId]`

## CANONICAL IMPLEMENTATION PLAN

### Layer A (Deterministic)
- **Route**: `src/app/api/media/messages/[id]/route.ts`
- **Helpers**: `src/lib/media/whatsappMedia.ts` (canonical)
- **Detection**: `src/lib/media/mediaTypeDetection.ts` (canonical)
- **UI**: `MediaMessage.tsx`, `AudioMessagePlayer.tsx` (use proxy URL)

### Files to DELETE
- `src/lib/media/resolveMediaSource.ts` (replace with inline logic)
- `src/app/api/whatsapp/media/[mediaId]/route.ts` (legacy)
- `src/app/api/media/route.ts` (if duplicate)

### Files to KEEP
- `src/lib/media/whatsappMedia.ts` ✅
- `src/lib/media/mediaTypeDetection.ts` ✅
- `src/lib/media/extractMediaId.ts` ✅ (webhook extraction)
- `src/lib/media/storage.ts` ✅ (for Plan B)








