# Zero-BS Audit: Leads React #310 + Media Rendering Issues

**Date:** 2025-01-XX  
**Target:** Fix Leads page React error #310 and Inbox media rendering

---

## A) LEADS AUDIT — React Error #310

### Error Description
"Rendered more hooks than during the previous render" — React error #310 indicates hooks are being called conditionally or in different orders between renders.

### Investigation Method
1. Enabled `productionBrowserSourceMaps: true` in `next.config.js` (already enabled)
2. Reproduced locally with `npm run build && npm run start`
3. Checked component structure for conditional hook calls

### Root Cause Analysis

#### Component: `src/app/leads/[id]/page.tsx`
**Status:** ✅ FIXED — All hooks are called before conditional returns
- Line 32-42: All `useState` hooks declared at top level
- Line 45-57: `useEffect` for initialization (unconditional)
- Line 60-71: `useSmartPolling` hook (unconditional, returns Promise.resolve if no leadId)
- Line 75-82: `useState` and `useEffect` for build info (unconditional)
- Line 86-131: `useEffect` for keyboard shortcuts (unconditional, guard logic inside)
- Line 226-239: Conditional return for loading state (AFTER all hooks)
- Line 242-293: Conditional return for not found (AFTER all hooks)

**Verdict:** Page component is safe. Hooks are always called in same order.

#### Component: `src/components/leads/LeadDNA.tsx`
**Status:** ⚠️ POTENTIALLY PROBLEMATIC — Child components may have conditional hooks

**Structure:**
- `LeadDNA` receives `lead` prop (can be null initially)
- Renders child components: `QualificationProgress`, `ExpiryTimeline`, `QuoteCadenceSection`, `SponsorSearch`, `DocumentsCardEnhanced`

**Child Component Analysis:**

1. **`QualificationProgress`** (Line 70-149):
   - ✅ `useState` hooks at top (lines 71-74)
   - ✅ `useEffect` at top (line 76-78) — BUT checks `lead?.id` inside
   - ⚠️ `useMemo` for `requiredFields` (line 100) — depends on `lead` which can be null
   - **Issue:** When `lead` is null → `lead.serviceTypeEnum` is undefined → `useMemo` still runs but with different values
   - **Fix Applied:** Always render component, pass empty object if lead is null

2. **`ExpiryTimeline`** (Line 359-428):
   - ✅ `useMemo` for expiries (line 360) — always called
   - ✅ Always returns JSX (never null) — fixed in previous commit
   - **Status:** Safe

3. **`QuoteCadenceSection`** (Line 228-247):
   - ✅ `useMemo` for date conversion (line 231) — always called
   - ⚠️ Line 241: Returns early if `!leadId || leadId === 0` — but this is AFTER hooks
   - **Status:** Safe (hooks called before return)

4. **`SponsorSearch`** (Line 432-521):
   - ✅ `useState` hooks at top (lines 433-436)
   - ✅ No conditional hooks
   - **Status:** Safe

**Verdict:** `LeadDNA` and children are now safe after recent fixes. All components always render, hooks are unconditional.

#### Component: `src/components/leads/NextBestActionPanel.tsx`
**Status:** ✅ SAFE — Hooks called before early returns
- Line 78-79: `useState` hooks (unconditional)
- Line 82-97: `useMemo` hooks (unconditional, return null if no lead)
- Line 100-110: `useMemo` (unconditional)
- Line 113-132: `useMemo` (unconditional)
- Line 135-150: `useEffect` (unconditional, guard inside)
- Line 268-290: Early returns (AFTER all hooks)
- **Verdict:** Safe — hooks always called in same order

### Actual Root Cause (Hypothesis)
The error may be caused by:
1. **React Strict Mode** causing double renders with different hook counts
2. **Component remounting** between renders (e.g., `LeadErrorBoundary` catching errors)
3. **Conditional rendering of entire component tree** based on `lead` state

### Fix Strategy
1. ✅ Ensure all hooks are called before any conditional returns
2. ✅ Always render child components (pass null/empty objects if needed)
3. ✅ Use guard logic INSIDE hooks, not by skipping hooks
4. ⚠️ **TODO:** Verify `LeadErrorBoundary` doesn't cause remounting issues

---

## B) MEDIA AUDIT — Inbox Media Not Loading

### Media Pipeline Trace

#### 1. Message Storage (Database)
**Schema:** `Message` model in Prisma
- `mediaUrl: string | null` — WhatsApp media ID or full URL
- `mediaMimeType: string | null` — MIME type (e.g., "audio/ogg", "image/jpeg", "application/pdf")
- `type: string` — Message type ("audio", "image", "document", "text")
- `body: string | null` — Text content or placeholder like "[Audio received]"
- `attachments: LeadAttachment[]` — Related attachments (optional)

**API Endpoint:** `GET /api/inbox/conversations/[id]`
- Line 104-116: Includes `attachments` relation
- Line 175-176: Returns `mediaUrl` and `mediaMimeType` in formatted messages
- Line 189-198: Maps attachments array

**Verdict:** API returns media data correctly.

#### 2. Media Serving (Backend)
**Endpoint:** `GET /api/whatsapp/media/[mediaId]`
**File:** `src/app/api/whatsapp/media/[mediaId]/route.ts`

**Current Implementation:**
- ✅ Fetches from Meta Graph API using access token
- ✅ Returns buffer with correct `Content-Type`
- ✅ Sets `Accept-Ranges: bytes` header
- ✅ Supports Range requests (206 Partial Content)
- ✅ Handles errors gracefully

**Verdict:** Backend proxy is correct.

#### 3. UI Rendering (Frontend)
**File:** `src/app/inbox/page.tsx`

**Current Logic Flow:**
1. Line 887: Check `msg.attachments && msg.attachments.length > 0` → Render attachments
2. Line 985: Check `msg.type === 'audio' && msg.mediaUrl` → Render audio player
3. Line 1017: Check `msg.type === 'image' && msg.mediaUrl` → Render image
4. Line 1061: Check `msg.type === 'document' && msg.mediaUrl` → Render document link
5. Line 1074: Check `msg.attachments` again (fallback)
6. Line 1157: Check `msg.mediaUrl` → Render based on type
7. Line 1227: Fallback to `getMessageDisplayText()` → Show "[Media message]" if placeholder

**Issues Identified:**
1. ⚠️ **Duplicate checks:** `msg.attachments` checked twice (line 887 and 1074)
2. ⚠️ **Type checking:** `msg.type === 'audio'` may not match actual type (could be "voice_note" or null)
3. ⚠️ **Media URL construction:** Uses `/api/whatsapp/media/${mediaId}` but `mediaId` might be a full URL already
4. ⚠️ **Placeholder detection:** Body text like "[Audio received]" may be shown instead of media if `mediaUrl` is missing

**Verdict:** Logic is complex and may miss edge cases. Need to verify with real data.

### Media URL Construction
**Current Pattern:**
```typescript
const audioUrl = msg.mediaUrl.startsWith('http') || msg.mediaUrl.startsWith('/')
  ? msg.mediaUrl
  : `/api/whatsapp/media/${encodeURIComponent(msg.mediaUrl)}?messageId=${msg.id}`
```

**Issue:** If `mediaUrl` is a WhatsApp media ID (e.g., "abc123"), it should go through proxy. But if it's already a full URL, it might be a Meta CDN URL that requires auth.

**Verdict:** Proxy usage is correct, but need to verify `mediaUrl` format in real data.

### Content-Type Verification
**Expected:**
- Audio: `audio/ogg`, `audio/mpeg`, `audio/mp4`, etc.
- Image: `image/jpeg`, `image/png`, `image/webp`, etc.
- PDF: `application/pdf`

**Need to verify:** Actual `mediaMimeType` values in database.

---

## C) TEST FIXTURES REQUIREMENTS

### Debug Endpoint Needed
**Route:** `GET /api/debug/inbox/sample-media`
**Auth:** Admin only (use `requireAdminApi`)

**Query Logic:**
```sql
-- Audio
SELECT id, conversationId, mediaUrl, mediaMimeType 
FROM Message 
WHERE (mediaMimeType LIKE 'audio/%' OR type IN ('audio', 'voice_note'))
  AND mediaUrl IS NOT NULL
ORDER BY createdAt DESC LIMIT 1

-- Image
SELECT id, conversationId, mediaUrl, mediaMimeType
FROM Message
WHERE mediaMimeType LIKE 'image/%'
  AND mediaUrl IS NOT NULL
ORDER BY createdAt DESC LIMIT 1

-- PDF
SELECT id, conversationId, mediaUrl, mediaMimeType, body
FROM Message
WHERE (mediaMimeType = 'application/pdf' OR body LIKE '%.pdf%')
  AND mediaUrl IS NOT NULL
ORDER BY createdAt DESC LIMIT 1
```

**Response Format:**
```json
{
  "ok": true,
  "build": "31c0bf5",
  "audio": {"conversationId": 123, "messageId": 456, "mediaUrl": "...", "mimeType": "..."},
  "image": {"conversationId": 234, "messageId": 567, "mediaUrl": "...", "mimeType": "..."},
  "pdf": {"conversationId": 345, "messageId": 678, "mediaUrl": "...", "mimeType": "..."}
}
```

---

## D) FIXES REQUIRED

### Leads #310
1. ✅ Ensure all hooks are unconditional
2. ✅ Always render child components
3. ⚠️ **TODO:** Verify `LeadErrorBoundary` doesn't cause issues
4. ⚠️ **TODO:** Test with React Strict Mode enabled

### Media Rendering
1. ✅ Use same-origin proxy for all media
2. ✅ Check `mediaUrl` before body text
3. ⚠️ **TODO:** Verify `mediaUrl` format in real messages
4. ⚠️ **TODO:** Handle cases where `mediaUrl` exists but media is not accessible
5. ⚠️ **TODO:** Improve placeholder detection (check `body` for "[Audio received]" pattern)

---

## E) NEXT STEPS

1. Implement `/api/debug/inbox/sample-media` endpoint
2. Create Playwright E2E tests
3. Run tests against deployed URL
4. Fix any failures
5. Generate proof package

