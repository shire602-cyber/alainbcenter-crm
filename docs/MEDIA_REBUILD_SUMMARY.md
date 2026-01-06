# Media System Rebuild Summary

## ✅ Completed Phases

### PHASE 0: Audit
- **Document**: `docs/MEDIA_SYSTEM_AUDIT.md`
- Identified all media-related files
- Found duplicates and conflicts
- Selected canonical implementations

### PHASE 1: Delete Old Pipeline
**Deleted:**
- `src/lib/media/resolveMediaSource.ts` (complex recovery heuristics)
- `src/app/api/whatsapp/media/[mediaId]/route.ts` (legacy route)

**Fixed:**
- `src/app/api/inbox/conversations/[id]/route.ts` - Added missing `hasMedia` import

### PHASE 2: Rebuild Layer A (Deterministic)
**New Implementation:** `src/app/api/media/messages/[id]/route.ts`

**Rules:**
- ✅ 404 if message not found
- ✅ 422 if message is not a media type
- ✅ 424 if `providerMediaId` is missing
- ✅ 410 if Meta returns expired
- ✅ 502 if Meta API fails
- ✅ 200/206 if successful (206 for Range requests)

**Uses Canonical Helpers:**
- `src/lib/media/whatsappMedia.ts` - `getWhatsAppDownloadUrl`, `fetchWhatsAppMediaStream`, `getWhatsAppAccessToken`
- `src/lib/media/mediaTypeDetection.ts` - `isMediaType`

**Features:**
- Supports Range requests for audio/video (206 Partial Content)
- Dev auth bypass via `MEDIA_PROXY_TEST_KEY` header
- Proper error responses with JSON reasons

### PHASE 3: Hard Validation
**Script:** `scripts/verify-media-proxy.ts`

**Features:**
- Queries DB for latest 50 media messages
- Picks at least 1 per type (image, audio, document, video)
- Tests HEAD, GET, and Range requests
- Validates status codes and body lengths
- Prints PASS/FAIL table
- Exits non-zero on failure

**Usage:**
```bash
MEDIA_PROXY_TEST_KEY=test123 npx tsx scripts/verify-media-proxy.ts
```

### PHASE 4: UI Confirmation
**Components Already Using Proxy:**
- ✅ `src/components/inbox/MediaMessage.tsx` - Uses `mediaProxyUrl`
- ✅ `src/components/inbox/AudioMessagePlayer.tsx` - Uses proxy URL
- ✅ `src/components/leads/ConversationWorkspace.tsx` - Uses proxy via `MediaAttachment`

**Error Handling:**
- ✅ Maps all proxy status codes (404, 422, 424, 410, 429, 502) to user-friendly messages
- ✅ Shows JSON error reasons when available

**API Routes:**
- ✅ `src/app/api/inbox/conversations/[id]/route.ts` - Returns `mediaProxyUrl`
- ✅ `src/app/api/leads/[id]/messages/route.ts` - Returns `mediaProxyUrl`

### PHASE 5: Plan B Design
**Document:** `docs/MEDIA_STORAGE_PLAN_B.md`

**Design Includes:**
- Ingest job architecture
- Storage backend interface (S3/R2/Local)
- Proxy route enhancements
- Cost considerations
- Migration strategy
- Rollback plan

**Status:** Design only, no implementation

## File Changes Summary

### Created
- `src/app/api/media/messages/[id]/route.ts` (rebuilt, deterministic)
- `scripts/verify-media-proxy.ts` (validation script)
- `docs/MEDIA_SYSTEM_AUDIT.md` (audit document)
- `docs/MEDIA_STORAGE_PLAN_B.md` (Plan B design)
- `docs/MEDIA_REBUILD_SUMMARY.md` (this file)

### Deleted
- `src/lib/media/resolveMediaSource.ts`
- `src/app/api/whatsapp/media/[mediaId]/route.ts`

### Modified
- `src/app/api/inbox/conversations/[id]/route.ts` - Added `hasMedia` import
- `src/app/api/media/messages/[id]/debug/route.ts` - Removed `resolveMediaSource` dependency
- `src/components/inbox/MediaMessage.tsx` - Enhanced error handling

### Unchanged (Canonical)
- `src/lib/media/whatsappMedia.ts` ✅
- `src/lib/media/mediaTypeDetection.ts` ✅
- `src/lib/media/extractMediaId.ts` ✅ (webhook extraction)
- `src/lib/media/storage.ts` ✅ (for Plan B)

## How to Run Verification

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Set test key (optional, for dev auth bypass):**
   ```bash
   echo "MEDIA_PROXY_TEST_KEY=test123" >> .env
   ```

3. **Run validation script:**
   ```bash
   npx tsx scripts/verify-media-proxy.ts
   ```

4. **Expected output:**
   ```
   ✅ ALL TESTS PASSED
   ```

## Testing Checklist

- [ ] Build passes: `npm run build`
- [ ] Validation script passes: `npx tsx scripts/verify-media-proxy.ts`
- [ ] Images render in Inbox
- [ ] Images render in Lead page
- [ ] Audio plays in Inbox
- [ ] Audio plays in Lead page
- [ ] PDFs open/download in Inbox
- [ ] PDFs open/download in Lead page
- [ ] Error messages show for 424 (missing metadata)
- [ ] Error messages show for 410 (expired)
- [ ] Error messages show for 502 (provider error)

## Next Steps (Future)

1. **Fix webhook extraction** - Ensure `providerMediaId` is always stored for new messages
2. **Backfill old messages** - Run migration to populate `providerMediaId` from `mediaUrl` where possible
3. **Implement Plan B** - Add durable storage for media (when needed)

## Notes

- **No changes to AI/auto-reply/cron** ✅
- **Media code isolated in `src/lib/media/*` and `src/app/api/media/*`** ✅
- **Deterministic flow: no recovery heuristics** ✅
- **Validation script tests actual endpoints** ✅








