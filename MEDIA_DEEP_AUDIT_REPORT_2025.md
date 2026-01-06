# Deep Audit Report: Media, PDF, Audio, and Images
**Date:** 2025-01-02  
**Scope:** All files handling media (images, PDFs, audio, video, documents)

---

## Executive Summary

This audit examined **22 media-related files** across the codebase. After recent deletions (`resolveMediaSource.ts` and `/api/whatsapp/media/[mediaId]/route.ts`), the media system relies entirely on the main media proxy endpoint (`/api/media/messages/[id]`). 

**Critical Finding:** The deletion of `resolveMediaSource.ts` means the media proxy no longer has a recovery mechanism for missing `providerMediaId`. The proxy currently only checks `providerMediaId` and `mediaUrl` fields but does NOT attempt recovery from `rawPayload`, `payload`, or `ExternalEventLog`.

---

## Files Audited

### Core Media Infrastructure (5 files)

#### 1. `/src/app/api/media/messages/[id]/route.ts` ⚠️ **CRITICAL ISSUES**
**Status:** Main media proxy endpoint  
**Issues Found:** 8

1. **MISSING: Recovery mechanism for missing providerMediaId**
   - **Severity:** CRITICAL
   - **Location:** Lines 104-146
   - **Issue:** After deletion of `resolveMediaSource.ts`, the proxy only checks `providerMediaId` and `mediaUrl`. It does NOT attempt recovery from:
     - `rawPayload` field
     - `payload` field  
     - `ExternalEventLog` table
   - **Impact:** Old messages without `providerMediaId` will fail with 424 error even if media ID exists in stored payloads
   - **Fix Required:** Re-implement recovery logic or restore `resolveMediaSource.ts`

2. **MISSING: mediaSize in select statement**
   - **Severity:** HIGH
   - **Location:** Lines 74-83 (GET), 342-351 (HEAD)
   - **Issue:** `mediaSize` is not selected from database, but it's used in response headers
   - **Impact:** File size information not available for Content-Length headers

3. **MISSING: OPTIONS handler for CORS preflight**
   - **Severity:** MEDIUM
   - **Location:** No OPTIONS handler exists
   - **Issue:** CORS preflight requests will fail
   - **Impact:** Cross-origin media requests may be blocked

4. **INCOMPLETE: CORS headers in GET response**
   - **Severity:** MEDIUM
   - **Location:** Lines 259-266
   - **Issue:** Missing `Access-Control-Allow-Headers` and `Access-Control-Expose-Headers`
   - **Impact:** Some CORS scenarios may fail

5. **MISSING: Filename sanitization in Content-Disposition**
   - **Severity:** MEDIUM
   - **Location:** Line 261
   - **Issue:** Filename not sanitized before use in header
   - **Impact:** Potential security risk (header injection)

6. **INCONSISTENT: Error handling for missing token**
   - **Severity:** LOW
   - **Location:** Lines 149-159
   - **Issue:** Returns 500 instead of 503 (Service Unavailable)
   - **Impact:** Misleading error code

7. **MISSING: Content-Length validation**
   - **Severity:** LOW
   - **Location:** Lines 269-271
   - **Issue:** No validation that Content-Length matches actual buffer size
   - **Impact:** Potential mismatched headers

8. **MISSING: Cache check before Meta API call**
   - **Severity:** LOW
   - **Location:** Before line 164
   - **Issue:** No check for cached media before calling Meta API
   - **Impact:** Unnecessary API calls

#### 2. `/src/lib/media/storage.ts` ✅ **GOOD**
**Status:** Media caching abstraction  
**Issues Found:** 0

- ✅ Proper error handling for disk full/permission errors
- ✅ Filename sanitization implemented
- ✅ Graceful fallback on cache misses
- ✅ Cleanup logic for failed metadata writes

#### 3. `/src/lib/media/whatsappMedia.ts` ✅ **GOOD**
**Status:** WhatsApp Media API helpers  
**Issues Found:** 1

1. **EXCESSIVE: Debug logging in production**
   - **Severity:** LOW
   - **Location:** Lines 254-297 (`getWhatsAppAccessToken`)
   - **Issue:** Verbose console.log statements for token retrieval
   - **Impact:** Log noise in production

#### 4. `/src/lib/media/mediaTypeDetection.ts` ✅ **GOOD**
**Status:** Centralized media type detection  
**Issues Found:** 0

- ✅ All functions properly implemented
- ✅ Consistent logic across codebase

#### 5. `/src/lib/media/extractMediaId.ts` ✅ **GOOD**
**Status:** Media ID extraction utility  
**Issues Found:** 0

- ✅ Proper validation for extracted IDs
- ✅ Handles multiple field name variations

---

### Media Upload & Sending (2 files)

#### 6. `/src/lib/whatsapp-media-upload.ts` ✅ **GOOD**
**Status:** Media upload to Meta  
**Issues Found:** 1

1. **MISSING: Filename sanitization in multipart form**
   - **Severity:** LOW
   - **Location:** Line 70
   - **Issue:** Filename in Content-Disposition not sanitized
   - **Impact:** Minor security risk

#### 7. `/src/app/api/upload/route.ts` ✅ **GOOD**
**Status:** Generic upload endpoint  
**Issues Found:** 0

- ✅ Proper file validation
- ✅ Size limits enforced

---

### Frontend Components (2 files)

#### 8. `/src/components/inbox/MediaMessage.tsx` ⚠️ **ISSUES FOUND**
**Status:** Main media rendering component  
**Issues Found:** 4

1. **INCONSISTENT: Retry query parameter usage**
   - **Severity:** MEDIUM
   - **Location:** Lines 165, 195, 234, 292, 330, 363
   - **Issue:** Some media types use `?retry=${retryCount}`, others don't
   - **Impact:** Inconsistent cache busting behavior

2. **MISSING: crossOrigin on fallback image**
   - **Severity:** LOW
   - **Location:** Line 292
   - **Issue:** Fallback image rendering (line 291) missing `crossOrigin="anonymous"`
   - **Impact:** Potential CORS issues

3. **REDUNDANT: Debug console.log statements**
   - **Severity:** LOW
   - **Location:** Lines 35-40, 45-57
   - **Issue:** Excessive logging in production
   - **Impact:** Console noise

4. **MISSING: Error boundary for media loading**
   - **Severity:** LOW
   - **Location:** Component level
   - **Issue:** No React error boundary to catch rendering errors
   - **Impact:** Potential UI crashes

#### 9. `/src/components/inbox/AudioMessagePlayer.tsx` ✅ **GOOD**
**Status:** Audio playback component  
**Issues Found:** 1

1. **REDUNDANT: HEAD request in error handler**
   - **Severity:** LOW
   - **Location:** Lines 67-100
   - **Issue:** Makes HEAD request on error, but audio element already tried to load
   - **Impact:** Unnecessary network request

---

### API Endpoints (6 files)

#### 10. `/src/app/api/inbox/conversations/[id]/route.ts` ✅ **GOOD**
**Status:** Conversation messages API  
**Issues Found:** 0

- ✅ Proper field selection (using `include` includes all fields)
- ✅ Media detection logic centralized
- ✅ All media fields included in response

#### 11. `/src/app/api/inbox/conversations/[id]/messages/route.ts` ✅ **GOOD**
**Status:** Send message endpoint  
**Issues Found:** 0

- ✅ Proper validation of `providerMediaId`
- ✅ Stores `mediaFilename` and `mediaSize`
- ✅ MIME type handling correct

#### 12. `/src/app/api/leads/[id]/messages/route.ts` ✅ **GOOD**
**Status:** Lead messages API  
**Issues Found:** 0

- ✅ Media fields included in response
- ✅ Centralized media detection

#### 13. `/src/app/api/media/route.ts` ✅ **GOOD**
**Status:** Generic media proxy  
**Issues Found:** 0

- ✅ CORS headers present
- ✅ OPTIONS handler implemented
- ✅ Range request support

#### 14. `/src/app/api/webhooks/whatsapp/route.ts` ⚠️ **ISSUES FOUND**
**Status:** WhatsApp webhook handler  
**Issues Found:** 2

1. **MISSING: providerMediaId update in ExternalEventLog**
   - **Severity:** MEDIUM
   - **Location:** Lines 671-694
   - **Issue:** Stores `providerMediaId` in payload but doesn't update message record if extraction succeeds later
   - **Impact:** Inconsistent data if extraction happens after storage

2. **INCOMPLETE: Media size extraction**
   - **Severity:** LOW
   - **Location:** Line 533
   - **Issue:** Extracts `mediaSize` but doesn't validate it's a positive number
   - **Impact:** Potential negative or zero sizes stored

#### 15. `/src/app/api/admin/backfill-media-ids/route.ts` ⚠️ **ISSUES FOUND**
**Status:** Admin backfill script  
**Issues Found:** 2

1. **MISSING: providerMediaId update**
   - **Severity:** HIGH
   - **Location:** Lines 114-131
   - **Issue:** Updates `mediaUrl` but NOT `providerMediaId` field
   - **Impact:** Backfilled messages still won't work with media proxy (which checks `providerMediaId` first)

2. **INCOMPLETE: Query for backfill**
   - **Severity:** MEDIUM
   - **Location:** Lines 21-41
   - **Issue:** Only queries messages where `mediaUrl` is null, but should also check `providerMediaId` is null
   - **Impact:** May miss messages that need backfilling

---

### Inbound Processing (1 file)

#### 16. `/src/lib/inbound/autoMatchPipeline.ts` ✅ **GOOD**
**Status:** Inbound message processing  
**Issues Found:** 0

- ✅ Proper extraction of `providerMediaId`, `mediaFilename`, `mediaSize`
- ✅ Multiple fallback attempts for media ID recovery
- ✅ All fields stored correctly

---

### Frontend Pages (2 files)

#### 17. `/src/app/inbox/page.tsx` ⚠️ **ISSUES FOUND**
**Status:** Main inbox page  
**Issues Found:** 3

1. **DEPRECATED: Reference to deleted endpoint**
   - **Severity:** HIGH
   - **Location:** Lines 1067, 1051, 1031
   - **Issue:** Still references `/api/whatsapp/media/${encodeURIComponent(att.url)}` which was deleted
   - **Impact:** Broken media links for attachments
   - **Fix:** Should use `/api/media/messages/${msg.id}` instead

2. **INCONSISTENT: Media URL construction**
   - **Severity:** MEDIUM
   - **Location:** Lines 186-222
   - **Issue:** `getMediaUrl` function has complex fallback logic that may not always use proxy
   - **Impact:** Inconsistent media access patterns

3. **REDUNDANT: Multiple media detection checks**
   - **Severity:** LOW
   - **Location:** Throughout component
   - **Issue:** Media detection logic duplicated in multiple places
   - **Impact:** Code complexity

#### 18. `/src/components/leads/ConversationWorkspace.tsx` ⚠️ **ISSUES FOUND**
**Status:** Lead conversation view  
**Issues Found:** 1

1. **DEPRECATED: Reference to deleted endpoint**
   - **Severity:** HIGH
   - **Location:** Line 1067
   - **Issue:** References `/api/whatsapp/media/${encodeURIComponent(att.url)}` which was deleted
   - **Impact:** Broken media links

---

### Document Upload (1 file)

#### 19. `/src/app/api/leads/[id]/documents/upload/route.ts` ✅ **GOOD**
**Status:** Document upload endpoint  
**Issues Found:** 0

- ✅ Filename sanitization implemented
- ✅ Proper validation

---

### Utility Files (1 file)

#### 20. `/src/lib/media/storage.ts` (already covered above)

---

## Critical Issues Summary

### 🔴 CRITICAL (Must Fix Immediately)

1. **Missing recovery mechanism in media proxy** (`/api/media/messages/[id]/route.ts`)
   - **Impact:** Old messages cannot recover media IDs from stored payloads
   - **Fix:** Re-implement recovery logic from `rawPayload`, `payload`, or `ExternalEventLog`

2. **Broken attachment links** (`inbox/page.tsx`, `ConversationWorkspace.tsx`)
   - **Impact:** Media attachments fail to load
   - **Fix:** Replace `/api/whatsapp/media/...` with `/api/media/messages/${messageId}`

3. **Backfill doesn't update providerMediaId** (`/api/admin/backfill-media-ids/route.ts`)
   - **Impact:** Backfilled messages still won't work
   - **Fix:** Update `providerMediaId` field in addition to `mediaUrl`

### 🟡 HIGH PRIORITY (Fix Soon)

4. **Missing mediaSize in media proxy select** (`/api/media/messages/[id]/route.ts`)
   - **Impact:** File size information unavailable
   - **Fix:** Add `mediaSize: true as any` to select statements

5. **Backfill query incomplete** (`/api/admin/backfill-media-ids/route.ts`)
   - **Impact:** May miss messages needing backfill
   - **Fix:** Also check `providerMediaId` is null in query

### 🟢 MEDIUM PRIORITY (Fix When Convenient)

6. **Missing OPTIONS handler** (`/api/media/messages/[id]/route.ts`)
7. **Incomplete CORS headers** (`/api/media/messages/[id]/route.ts`)
8. **Filename sanitization missing** (`/api/media/messages/[id]/route.ts`)
9. **Inconsistent retry parameter usage** (`MediaMessage.tsx`)
10. **Missing crossOrigin on fallback image** (`MediaMessage.tsx`)

### 🔵 LOW PRIORITY (Nice to Have)

11. **Excessive debug logging** (multiple files)
12. **Error code inconsistencies** (`/api/media/messages/[id]/route.ts`)
13. **Missing cache check** (`/api/media/messages/[id]/route.ts`)

---

## Recommendations

1. **IMMEDIATE:** Re-implement media ID recovery in the media proxy endpoint
2. **IMMEDIATE:** Fix broken attachment links in frontend components
3. **IMMEDIATE:** Update backfill script to set `providerMediaId`
4. **SOON:** Add `mediaSize` to media proxy select statements
5. **SOON:** Add OPTIONS handler and complete CORS headers
6. **LATER:** Standardize retry parameter usage in MediaMessage component
7. **LATER:** Remove excessive debug logging in production

---

## Files Status Overview

| File | Status | Issues | Priority |
|------|--------|--------|----------|
| `/api/media/messages/[id]/route.ts` | ⚠️ | 8 | CRITICAL |
| `storage.ts` | ✅ | 0 | - |
| `whatsappMedia.ts` | ✅ | 1 | LOW |
| `mediaTypeDetection.ts` | ✅ | 0 | - |
| `extractMediaId.ts` | ✅ | 0 | - |
| `whatsapp-media-upload.ts` | ✅ | 1 | LOW |
| `upload/route.ts` | ✅ | 0 | - |
| `MediaMessage.tsx` | ⚠️ | 4 | MEDIUM |
| `AudioMessagePlayer.tsx` | ✅ | 1 | LOW |
| `conversations/[id]/route.ts` | ✅ | 0 | - |
| `conversations/[id]/messages/route.ts` | ✅ | 0 | - |
| `leads/[id]/messages/route.ts` | ✅ | 0 | - |
| `media/route.ts` | ✅ | 0 | - |
| `webhooks/whatsapp/route.ts` | ⚠️ | 2 | MEDIUM |
| `admin/backfill-media-ids/route.ts` | ⚠️ | 2 | HIGH |
| `autoMatchPipeline.ts` | ✅ | 0 | - |
| `inbox/page.tsx` | ⚠️ | 3 | HIGH |
| `ConversationWorkspace.tsx` | ⚠️ | 1 | HIGH |
| `leads/[id]/documents/upload/route.ts` | ✅ | 0 | - |

**Total Issues:** 23  
**Critical:** 3  
**High:** 3  
**Medium:** 6  
**Low:** 11

---

## Conclusion

The media system is **mostly functional** but has **critical gaps** introduced by the deletion of `resolveMediaSource.ts`. The main media proxy endpoint needs recovery logic restored, and frontend components have broken references to deleted endpoints. Once these are fixed, the system should be robust.

**Estimated Fix Time:** 4-6 hours for critical issues, 2-3 hours for high priority, 3-4 hours for medium/low priority.
