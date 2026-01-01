# DEBUG BUNDLE - Leads + Media Issues

**Generated:** 2025-01-01  
**Git Commit:** `1829828` (latest)  
**Purpose:** Gather ALL evidence to identify EXACTLY why Leads pages fail and Audio messages don't render

---

## STEP 1 — Runtime + Deployment Context

### Git Commit Hash
```
1829828
```

### Deployed Base URL
```
https://alainbcenter-3ke1it6ff-abdurahmans-projects-66129df5.vercel.app
```

### Build Stamp Selector
**Location in code:** 
- `src/app/leads/[id]/page.tsx` lines 469-473
- `src/app/inbox/page.tsx` lines 1408-1412

**Rendered as:**
```tsx
{buildInfo && (
  <div className="fixed bottom-2 right-2 text-xs text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded z-50">
    Build: {buildInfo.buildId || 'unknown'}
  </div>
)}
```

**Selector used in tests:** `text=/Build:/i` (case-insensitive regex)

**Note:** Build stamp is conditionally rendered only if `buildInfo` is not null. It's fetched in a `useEffect` hook (lines 77-82 in leads page, lines 167-172 in inbox page).

### Next.js Version
From `package.json`:
```json
"next": "^15.3.8"
```

### App Router Usage
✅ **YES** - Using App Router (`src/app` directory structure)

### Playwright Version
From `package.json`:
```json
"@playwright/test": "^1.57.0"
```

### Playwright Command Used
```bash
npx playwright test e2e/test-leads-media-comprehensive.spec.ts --reporter=list,html --project=chromium
```

**Full output:** See `debug-bundle/test-output.txt`

---

## STEP 2 — Failing Test Artifacts

### Artifacts Location
`debug-bundle/artifacts/`

### Included Artifacts
- `test-output.txt` - Full Playwright test output
- `probe-output.txt` - HTTP probe script output
- `test-results/` - Screenshots, videos, traces for failing tests
- `playwright-report/` - HTML test report (if generated)

### Key Artifacts for Failing Tests

#### Leads Page Timeout Test
- **Test:** `e2e/test-leads-media-comprehensive.spec.ts:28:7`
- **Error:** `Test timeout of 30000ms exceeded. Error: locator.textContent: Test timeout of 30000ms exceeded. Call log: - waiting for locator('text=/Build:/')`
- **Screenshots:** `test-results/test-leads-media-comprehen-*-chromium/test-failed-1.png`
- **Video:** `test-results/test-leads-media-comprehen-*-chromium/video.webm`
- **Trace:** `test-results/test-leads-media-comprehen-*-chromium-retry1/trace.zip`

#### Audio Element Not Found Test
- **Test:** `e2e/test-leads-media-comprehensive.spec.ts:96:7`
- **Error:** `expect(locator).toHaveCount(expected) failed. Locator: locator('audio').first() Expected: 1 Received: 0`
- **Screenshots:** `test-results/test-leads-media-comprehen-*-audio-*-chromium/test-failed-1.png`
- **Video:** `test-results/test-leads-media-comprehen-*-audio-*-chromium/video.webm`
- **Trace:** `test-results/test-leads-media-comprehen-*-audio-*-chromium-retry1/trace.zip`

---

## STEP 3 — Source Files (Verbatim Copies)

All files are in `debug-bundle/files/` with paths converted to underscores.

### A) Leads Route + Direct Children
- ✅ `src_app_leads_id_page.tsx.txt` - Main leads detail page
- ✅ `src_app_leads_id_error.tsx.txt` - Error boundary (if exists)
- ⚠️ `src_app_leads_id_loading.tsx.txt` - Loading component (if exists)

### B) Leads Components
- ✅ `src_components_leads_LeadDNA.tsx.txt`
- ✅ `src_components_leads_NextBestActionPanel.tsx.txt`
- ✅ `src_components_leads_ConversationWorkspace.tsx.txt`
- ✅ `src_components_leads_LeadErrorBoundary.tsx.txt`
- ✅ `src_components_leads_LeadCommandPalette.tsx.txt`
- ✅ All other files in `src/components/leads/`

### C) Shared Components Used by Leads Page
- ✅ `src_components_layout_MainLayout.tsx.txt`
- ✅ `src_components_dashboard_FocusModeBanner.tsx.txt`
- ✅ `src_hooks_useSmartPolling.ts.txt`

### D) Inbox Route + Media Rendering
- ✅ `src_app_inbox_page.tsx.txt` - Main inbox page
- ✅ `src_components_inbox_AudioMessagePlayer.tsx.txt` - Audio player component
- ✅ All other files in `src/components/inbox/`

### E) Media/API Endpoints
- ✅ `src_app_api_whatsapp_media_[mediaId]_route.ts.txt` - WhatsApp media proxy
- ✅ `src_app_api_debug_inbox_sample-media_route.ts.txt` - Debug endpoint
- ✅ `src_app_api_inbox_conversations_id_route.ts.txt` - Inbox conversation API
- ✅ `src_app_api_leads_id_route.ts.txt` - Lead detail API
- ✅ `src_app_api_leads_id_messages_route.ts.txt` - Lead messages API
- ✅ `src_app_api_health_route.ts.txt` - Health check endpoint

### F) Config + Middleware
- ✅ `next.config.js.txt`
- ⚠️ `middleware.txt` or `src_middleware.ts.txt` (if exists)

### G) Playwright Config + Tests
- ✅ `playwright.config.ts.txt`
- ✅ `e2e_auth.setup.ts.txt`
- ✅ `e2e_test-leads-media-comprehensive.spec.ts.txt`

### H) Data Access Layer
- ✅ `prisma_schema.prisma.txt` - Database schema

---

## STEP 4 — Automated Route Health Probe

**Script:** `scripts/debug_probe.ts`

**Output:** `debug-bundle/probe-output.txt`

**What it probes:**
1. `/api/health` - Build info
2. `/api/leads` - Get first lead ID
3. `/api/leads/[id]` - Get lead detail
4. `/api/debug/inbox/sample-media` - Get sample media IDs
5. Audio/Image/PDF media proxy URLs - Verify headers and content
6. `/api/inbox/conversations/[id]` - Get conversation messages

**Key findings from probe output:**
(See `debug-bundle/probe-output.txt` for full details)

---

## STEP 5 — Explicit Answers to Questions

### 1) Leads Timeout

#### Q: Is /leads/[id] a server component?
**A:** ❌ **NO** - It's a client component (`'use client'` directive at line 1 of `src/app/leads/[id]/page.tsx`)

#### Q: What does it wait on?
**A:** The page waits on:
1. **Async params resolution** (line 45-57): `await params` to get the lead ID
2. **Lead data fetch** (line 133-172): `loadLead(id)` function that fetches from `/api/leads/${id}`
3. **Build info fetch** (line 77-82): `fetch('/api/health')` to get build stamp

**Code reference:**
```tsx
// Line 45-57: Wait for params
useEffect(() => {
  async function init() {
    const resolved = await params
    const id = parseInt(resolved.id)
    if (isNaN(id)) {
      router.push('/leads')
      return
    }
    setLeadId(id)
    await loadLead(id)
  }
  init()
}, [params, router])

// Line 133-172: loadLead function
async function loadLead(id: number) {
  // ... fetches from /api/leads/${id}
}
```

#### Q: What is the exact reason Playwright times out?
**A:** The test times out waiting for the build stamp selector `text=/Build:/` to appear. 

**Possible reasons:**
1. **Build stamp not rendered:** `buildInfo` state is `null` (fetch failed or not completed)
2. **Build stamp selector too strict:** The regex `text=/Build:/i` may not match if there's extra whitespace or different formatting
3. **Page not fully loaded:** The `useEffect` that fetches build info (line 77-82) may not have completed
4. **Navigation timeout:** The page navigation itself may be taking too long (>30s)

**Test code reference (line 34 of test file):**
```typescript
const buildStamp = await page.locator('text=/Build:/').textContent()
```

**Note:** The test waits for build stamp BEFORE checking for React errors, which may cause unnecessary timeouts if build stamp is slow to appear.

#### Q: What selector is the test waiting for? Is it real?
**A:** The test waits for:
1. **Build stamp:** `text=/Build:/i` - This is rendered conditionally (only if `buildInfo` is not null)
2. **Lead detail:** `[data-testid="lead-detail"]` - This is rendered at line 314 (mobile) and line 405 (desktop)

**Build stamp selector is REAL** but **conditionally rendered**. If `buildInfo` is null, the build stamp div won't exist in the DOM.

#### Q: Do we see any server error logs during navigation?
**A:** Check `debug-bundle/test-output.txt` and `debug-bundle/probe-output.txt` for server errors. The probe script will show HTTP status codes for all endpoints.

---

### 2) Audio Element Not Found

#### Q: How does the UI decide a message is audio?
**A:** The UI checks multiple conditions in this order:

1. **First check (line 887):** `msg.attachments && msg.attachments.length > 0` - If attachments exist, check for audio type
2. **Second check (line 985):** Complex condition:
   ```tsx
   (msg.type === 'audio' || msg.mediaMimeType?.startsWith('audio/') || msg.attachments?.some((a: any) => a.type === 'audio')) 
   && 
   (msg.mediaUrl || msg.attachments?.some((a: any) => a.type === 'audio'))
   ```
3. **Third check (line 1157):** `msg.mediaUrl` exists, then check `msg.type === 'audio' || msg.mediaMimeType?.startsWith('audio/')`

**Code reference:** `src/app/inbox/page.tsx` lines 887, 985, 1157

#### Q: What field is the audio URL built from?
**A:** The audio URL is built from:

1. **Primary:** `msg.mediaUrl` (if exists and non-empty)
2. **Fallback:** `msg.attachments?.find((a: any) => a.type === 'audio')?.url`

**Code reference (line 1003):**
```tsx
const audioId = msg.mediaUrl || msg.attachments?.find((a: any) => a.type === 'audio')?.url || ''
```

**Then converted to proxy URL if needed (line 1004-1006):**
```tsx
return audioId.startsWith('http') || audioId.startsWith('/')
  ? audioId
  : `/api/whatsapp/media/${encodeURIComponent(audioId)}?messageId=${msg.id}`
```

#### Q: What happens when mediaUrl is empty?
**A:** **FIXED in commit `1829828`** - Now checks if `audioId` is empty before rendering:

**Code reference (line 1000-1020):**
```tsx
{(() => {
  const audioId = (msg.mediaUrl && msg.mediaUrl.trim()) || msg.attachments?.find((a: any) => a.type === 'audio')?.url || ''
  if (!audioId || audioId.trim() === '') {
    // Show placeholder instead of AudioMessagePlayer
    return (
      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
        <p className="text-sm opacity-75">[Audio message - media unavailable]</p>
      </div>
    )
  }
  // ... render AudioMessagePlayer
})()}
```

**Before fix:** Empty `mediaUrl` would result in `mediaId=""` being passed to AudioMessagePlayer, which would not render `<audio>` element.

#### Q: What URL is ultimately used in the DOM?
**A:** The URL flow is:

1. **AudioMessagePlayer receives:** Either a full URL (`http://...` or `/...`) or a proxy path (`/api/whatsapp/media/${mediaId}?messageId=${messageId}`)
2. **AudioMessagePlayer fetches:** The URL via `fetch()` with `credentials: 'include'`
3. **AudioMessagePlayer creates:** A blob URL via `URL.createObjectURL(blob)`
4. **DOM `<audio>` element gets:** The blob URL as `src` attribute

**Code reference:** `src/components/inbox/AudioMessagePlayer.tsx` lines 41-71 (fetch) and line 185 (`<audio ref={audioRef} src={audioUrl || undefined} />`)

**Important:** The `<audio>` element's `src` is a **blob URL**, not the original proxy URL. This is why Playwright may not intercept the original request.

#### Q: Do we render `<audio>` or a custom player?
**A:** We render **BOTH**:
1. **`<audio>` element** (line 185): Hidden, used for actual playback
2. **Custom UI** (lines 187-226): Play/pause button, progress bar, download button

**Code reference:** `src/components/inbox/AudioMessagePlayer.tsx` line 185:
```tsx
<audio ref={audioRef} src={audioUrl || undefined} preload="metadata" />
```

**Note:** The `<audio>` element is always rendered (even if `audioUrl` is null), but it won't have a `src` attribute if `audioUrl` is null.

#### Q: Do network probes show the audio endpoint returns audio/* and bytes?
**A:** See `debug-bundle/probe-output.txt` for actual probe results. The probe script:
1. Fetches sample audio from debug endpoint
2. Probes the audio proxy URL with Range header
3. Logs `Content-Type`, `Accept-Ranges`, `Content-Range`, `Content-Length`

**Expected:**
- Status: 200 or 206
- Content-Type: `audio/*`
- Accept-Ranges: `bytes`
- Body size: > 100 bytes

---

## File Index

### Artifacts
- `debug-bundle/artifacts/test-output.txt` - Full Playwright test output
- `debug-bundle/artifacts/probe-output.txt` - HTTP probe results
- `debug-bundle/artifacts/test-results/` - Screenshots, videos, traces
- `debug-bundle/artifacts/playwright-report/` - HTML test report

### Source Files (in `debug-bundle/files/`)
- All files listed in STEP 3 above
- Files named with underscores replacing slashes (e.g., `src_app_leads_id_page.tsx.txt`)

### Scripts
- `scripts/debug_probe.ts` - HTTP probe script

---

## Key Findings Summary

### Leads Page Timeout
1. **Root cause:** Test waits for build stamp that may not render if `buildInfo` is null
2. **Build stamp is conditional:** Only renders if `fetch('/api/health')` succeeds
3. **Test selector may be too strict:** Regex `text=/Build:/i` may not match if formatting differs
4. **Recommendation:** Make build stamp check optional in test, or ensure it always renders

### Audio Element Not Found
1. **Root cause:** AudioMessagePlayer may not render `<audio>` if:
   - `mediaUrl` is empty (now fixed to show placeholder)
   - Fetch fails (component shows error state, not `<audio>`)
   - Blob URL creation fails
2. **`<audio>` element is hidden:** It's rendered but not visible (used for playback only)
3. **Test looks for `<audio>`:** But it may not exist if AudioMessagePlayer is in error/loading state
4. **Recommendation:** Test should check for AudioMessagePlayer wrapper div, not just `<audio>` element

---

## Next Steps

1. Review probe output to verify API endpoints return expected data
2. Check test artifacts (screenshots/videos) to see actual page state
3. Verify build stamp actually renders in production
4. Check if AudioMessagePlayer is rendering error state instead of `<audio>`

