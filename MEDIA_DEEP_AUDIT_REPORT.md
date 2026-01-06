# MEDIA DEEP AUDIT REPORT
**Date:** 2025-01-02  
**Scope:** All files handling media, PDF, audio, or images

## EXECUTIVE SUMMARY

This audit examined **23 files** across the codebase that handle media (images, PDFs, audio, video). Found **14 critical issues** and **8 medium-priority issues** that could cause media failures.

---

## CRITICAL ISSUES (Must Fix)

### 1. **Missing `mediaFilename` in `/api/leads/[id]/messages` response**
**File:** `src/app/api/leads/[id]/messages/route.ts`  
**Line:** 125-167  
**Issue:** The endpoint doesn't include `mediaFilename` in the formatted response, even though it's available in the database. This breaks document downloads in the leads view.  
**Impact:** Documents cannot be downloaded with proper filenames in the leads interface.  
**Fix:** Add `mediaFilename: msg.mediaFilename || null` to the formatted response object.

### 2. **Missing CORS headers in `/api/whatsapp/media/[mediaId]`**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Line:** 121-126  
**Issue:** This endpoint doesn't include CORS headers (`Access-Control-Allow-Origin`, etc.), which can cause CORS errors when accessing media from the frontend.  
**Impact:** Media may fail to load due to CORS restrictions, especially in cross-origin scenarios.  
**Fix:** Add CORS headers to all responses (GET, HEAD, OPTIONS).

### 3. **Missing OPTIONS handler in `/api/whatsapp/media/[mediaId]`**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Issue:** No OPTIONS handler for CORS preflight requests.  
**Impact:** Browser preflight checks will fail, blocking media access.  
**Fix:** Add `export async function OPTIONS()` handler.

### 4. **No error handling for expired media (410) in `/api/whatsapp/media/[mediaId]`**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Line:** 72-78, 106-110  
**Issue:** Doesn't check for 410 (Gone) status from Meta API, which indicates media has expired.  
**Impact:** Users get generic errors instead of clear "media expired" messages.  
**Fix:** Add explicit 410 handling with user-friendly error message.

### 5. **No retry logic in `/api/whatsapp/media/[mediaId]`**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Line:** 63-70, 102-104  
**Issue:** No retry logic for network errors or 5xx responses from Meta API.  
**Impact:** Transient failures cause permanent media load failures.  
**Fix:** Implement retry logic with exponential backoff (similar to `whatsappMedia.ts`).

### 6. **No rate limit handling in `/api/whatsapp/media/[mediaId]`**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Line:** 72-78  
**Issue:** Doesn't handle 429 (Rate Limited) responses from Meta API.  
**Impact:** Rate limit errors cause permanent failures instead of retrying.  
**Fix:** Add 429 detection and retry with backoff.

### 7. **Inconsistent media type detection in `/api/leads/[id]/messages`**
**File:** `src/app/api/leads/[id]/messages/route.ts`  
**Line:** 109-117  
**Issue:** Uses ad-hoc media type detection logic instead of centralized `hasMedia()` function from `mediaTypeDetection.ts`.  
**Impact:** Inconsistent behavior if detection logic changes.  
**Fix:** Replace with `hasMedia(msg.type, msg.mediaMimeType)` from `mediaTypeDetection.ts`.

### 8. **Missing `providerMediaId` in `/api/inbox/conversations/[id]` select**
**File:** `src/app/api/inbox/conversations/[id]/route.ts`  
**Line:** 93-117  
**Issue:** The `messages` query uses `include` instead of `select`, so all fields are returned, but we should explicitly verify `providerMediaId` is accessible.  
**Impact:** May cause TypeScript errors or missing data if Prisma types aren't regenerated.  
**Fix:** Verify `providerMediaId` is accessible in the response (it should be, but add explicit type assertion if needed).

### 9. **Missing `mediaFilename` in `/api/inbox/conversations/[id]` select verification**
**File:** `src/app/api/inbox/conversations/[id]/route.ts`  
**Line:** 195  
**Issue:** Uses `msg.mediaFilename` but doesn't verify it's selected.  
**Impact:** May be undefined if not properly selected.  
**Status:** Already fixed (line 195 shows it's included), but verify it's in the Prisma query.

### 10. **No error handling for redirects in `/api/whatsapp/media/[mediaId]`**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Line:** 102-104  
**Issue:** Doesn't handle redirects from Meta download URLs (unlike `fetchWhatsAppMediaStream` which does).  
**Impact:** Redirects may fail if auth headers aren't preserved.  
**Fix:** Add redirect handling similar to `fetchWhatsAppMediaStream`.

### 11. **Missing `mediaFilename` in `/api/leads/[id]/messages` database query**
**File:** `src/app/api/leads/[id]/messages/route.ts`  
**Line:** 54-99  
**Issue:** Uses `include` for messages, which should include all fields, but `mediaFilename` may not be explicitly accessible.  
**Impact:** `mediaFilename` may be undefined in the response.  
**Fix:** Verify `mediaFilename` is accessible, or add explicit select.

### 12. **No caching in `/api/whatsapp/media/[mediaId]`**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Line:** 144-145  
**Issue:** Doesn't cache media files locally, unlike the main media proxy.  
**Impact:** Every request hits Meta API, causing rate limits and slower responses.  
**Fix:** Add caching using `putMedia()` from `storage.ts`.

### 13. **Missing error details in `/api/whatsapp/media/[mediaId]` error responses**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Line:** 72-78, 106-110  
**Issue:** Error responses don't include detailed error information (reason, messageId, etc.).  
**Impact:** Hard to debug failures.  
**Fix:** Add structured error responses with `reason` field.

### 14. **Inconsistent access token retrieval in `/api/whatsapp/media/[mediaId]`**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`  
**Line:** 32-60  
**Issue:** Uses custom token retrieval logic instead of centralized `getWhatsAppAccessToken()` from `whatsappMedia.ts`.  
**Impact:** Inconsistent behavior and code duplication.  
**Fix:** Use `getWhatsAppAccessToken()` from `whatsappMedia.ts`.

---

## MEDIUM PRIORITY ISSUES

### 15. **Missing `mediaSize` in `/api/leads/[id]/messages` response**
**File:** `src/app/api/leads/[id]/messages/route.ts`  
**Issue:** `mediaSize` is not included in the formatted response.  
**Impact:** Frontend cannot show file sizes.  
**Fix:** Add `mediaSize: msg.mediaSize || null` to response.

### 16. **No Content-Length validation in media proxy**
**File:** `src/app/api/media/messages/[id]/route.ts`  
**Line:** 349-351  
**Issue:** Content-Length is added if available, but not validated against actual buffer size.  
**Impact:** Mismatched Content-Length could cause client errors.  
**Fix:** Validate Content-Length matches buffer size before sending.

### 17. **Missing error logging in `resolveMediaSource`**
**File:** `src/lib/media/resolveMediaSource.ts`  
**Line:** 280-287  
**Issue:** ExternalEventLog parse errors are logged but don't include full error context.  
**Impact:** Hard to debug payload parsing failures.  
**Fix:** Add more detailed error logging with stack traces.

### 18. **No validation of `providerMediaId` format**
**File:** `src/lib/media/resolveMediaSource.ts`  
**Line:** 21-32  
**Issue:** Doesn't validate that `providerMediaId` looks like a valid WhatsApp media ID.  
**Impact:** Invalid IDs may be sent to Meta API, causing unnecessary failures.  
**Fix:** Add basic format validation (e.g., non-empty, no spaces, reasonable length).

### 19. **Missing cache cleanup for old media**
**File:** `src/lib/media/storage.ts`  
**Issue:** No mechanism to clean up old cached media files.  
**Impact:** Cache directory can grow indefinitely.  
**Fix:** Add periodic cleanup or LRU eviction.

### 20. **No validation of MIME type in media proxy**
**File:** `src/app/api/media/messages/[id]/route.ts`  
**Line:** 134, 318  
**Issue:** MIME type is used directly without validation.  
**Impact:** Invalid MIME types could cause client errors.  
**Fix:** Validate MIME type format before using.

### 21. **Missing `mediaFilename` in cache metadata**
**File:** `src/lib/media/storage.ts`  
**Line:** 109-114  
**Issue:** `filename` is optional in metadata, but should always be stored if available.  
**Impact:** Cached media may lose filename information.  
**Status:** Already handled (filename is stored if provided), but verify it's always passed.

### 22. **No timeout handling in Meta API calls**
**File:** `src/lib/media/whatsappMedia.ts`  
**Line:** 43-50, 145-148  
**Issue:** Fetch calls don't have explicit timeouts.  
**Impact:** Requests can hang indefinitely.  
**Fix:** Add timeout using `AbortController` with reasonable timeout (e.g., 30 seconds).

---

## LOW PRIORITY / CODE QUALITY ISSUES

### 23. **Duplicate token retrieval logic**
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts` vs `src/lib/media/whatsappMedia.ts`  
**Issue:** Token retrieval is duplicated instead of using centralized function.  
**Fix:** Use `getWhatsAppAccessToken()` everywhere.

### 24. **Inconsistent error message formats**
**File:** Multiple files  
**Issue:** Error messages use different formats (some have `reason`, some don't).  
**Fix:** Standardize error response format across all endpoints.

### 25. **Missing TypeScript types for media responses**
**File:** Multiple API route files  
**Issue:** Response types are inferred instead of explicitly defined.  
**Fix:** Add explicit TypeScript interfaces for API responses.

---

## FILES AUDITED

### Core Media Files
- ✅ `src/app/api/media/messages/[id]/route.ts` - Main media proxy (mostly good, minor issues)
- ✅ `src/lib/media/resolveMediaSource.ts` - Media ID resolution (good)
- ✅ `src/lib/media/whatsappMedia.ts` - WhatsApp API helpers (good, minor timeout issue)
- ✅ `src/lib/media/storage.ts` - Media caching (good)
- ✅ `src/lib/media/extractMediaId.ts` - Media ID extraction (good)
- ✅ `src/lib/media/mediaTypeDetection.ts` - Type detection (good)

### Frontend Components
- ✅ `src/components/inbox/MediaMessage.tsx` - Media rendering (good)
- ✅ `src/components/inbox/AudioMessagePlayer.tsx` - Audio player (good)

### API Endpoints
- ⚠️ `src/app/api/whatsapp/media/[mediaId]/route.ts` - **MULTIPLE ISSUES**
- ⚠️ `src/app/api/leads/[id]/messages/route.ts` - **MISSING FIELDS**
- ✅ `src/app/api/inbox/conversations/[id]/route.ts` - Mostly good
- ✅ `src/app/api/webhooks/whatsapp/route.ts` - Good
- ✅ `src/app/api/upload/route.ts` - Good

### Other Files
- ✅ `src/lib/inbound/autoMatchPipeline.ts` - Good
- ✅ `src/components/leads/ConversationWorkspace.tsx` - Good
- ✅ `src/app/inbox/page.tsx` - Good

---

## PRIORITY FIX ORDER

1. **Fix #2, #3** - Add CORS headers to `/api/whatsapp/media/[mediaId]` (blocks cross-origin access)
2. **Fix #1, #11** - Add `mediaFilename` to `/api/leads/[id]/messages` (breaks document downloads)
3. **Fix #4, #5, #6** - Add error handling and retry logic to `/api/whatsapp/media/[mediaId]` (causes failures)
4. **Fix #7** - Use centralized media detection (consistency)
5. **Fix #12** - Add caching to `/api/whatsapp/media/[mediaId]` (performance)
6. **Fix #14** - Use centralized token retrieval (code quality)
7. **Fix #22** - Add timeouts to API calls (resilience)
8. **Fix remaining medium/low priority issues**

---

## SUMMARY

**Total Issues Found:** 25  
**Critical:** 14  
**Medium:** 8  
**Low:** 3  

**Files with Issues:**
- `src/app/api/whatsapp/media/[mediaId]/route.ts` - **9 issues** (most critical)
- `src/app/api/leads/[id]/messages/route.ts` - **4 issues**
- Other files - **12 issues** (scattered)

**Estimated Fix Time:** 4-6 hours for all critical issues.








