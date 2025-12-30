# Production Message Delivery Fix

## Summary

Fixed production message delivery issues:
1. ✅ Removed 10-minute delay for WhatsApp auto-replies (tasks now due immediately)
2. ✅ Removed webhook HTTP "kick" to job runner (webhook only enqueues, cron processes)
3. ✅ Enhanced logging for jobs skipped (not due yet, claimed, etc.)
4. ✅ Enhanced logging for Meta API responses on send failures
5. ✅ Verified all routes have `export const dynamic = 'force-dynamic'`
6. ✅ **Fixed middleware 401 blocking cron/webhooks/jobs** - Added hard bypass for `/api/cron/*`, `/api/webhooks/*`, `/api/jobs/*`, `/api/health/*`
7. ✅ **Added cron debug endpoint** - `/api/cron/debug` for production debugging
8. ✅ **Added job debug endpoint** - `/api/jobs/debug` for inspecting job status, stuck jobs, not-eligible jobs
9. ✅ **Fixed duplication prevention** - Ensured text is always extracted as string (never JSON stringified)
10. ✅ **Enhanced logging** - Added text preview and messageId logging before/after Meta API calls
11. ✅ **Verified UI message visibility** - Confirmed `/api/leads/[id]/messages` and `/api/inbox/conversations/[id]` include outbound messages
8. ✅ **Added job debug endpoint** - `/api/jobs/debug` for inspecting job status, stuck jobs, not-eligible jobs
9. ✅ **Fixed duplication prevention** - Ensured text is always extracted as string (never JSON stringified)
10. ✅ **Enhanced logging** - Added text preview and messageId logging before/after Meta API calls
11. ✅ **Verified UI message visibility** - Confirmed `/api/leads/[id]/messages` and `/api/inbox/conversations/[id]` include outbound messages

## Middleware 401 Fix (CRITICAL)

**Problem:** Vercel cron requests to `/api/cron/run-outbound-jobs` were returning 401 "Unauthorized" because middleware was blocking them BEFORE the route handler ran.

**Solution:** Added hard path-based bypass at the VERY TOP of middleware (before any auth checks):
- `/api/cron/*` - All cron endpoints
- `/api/webhooks/*` - All webhook endpoints  
- `/api/jobs/*` - All job runner endpoints
- `/api/health/*` - Health check endpoints

**Key Points:**
- Bypass is path-based (does NOT rely on headers which may vary)
- Bypass occurs BEFORE session validation
- Middleware logs: `[MIDDLEWARE] bypass path=... ua=...`
- Cron route logs: `[CRON] reached handler requestId=... xVercelCron=... ua=...`

**Files Changed:**
- `src/middleware.ts` - Added bypass logic at top
- `src/app/api/cron/run-outbound-jobs/route.ts` - Added handler-reached log
- `src/app/api/cron/debug/route.ts` - NEW debug endpoint

## File Changes

### 0. `src/middleware.ts` (CRITICAL FIX)
**Change:** Added hard bypass for cron/webhooks/jobs/health endpoints at the VERY TOP (before any auth checks)

**Added (at top of middleware function):**
```typescript
// CRITICAL: Hard bypass for cron, webhooks, jobs, and health endpoints
// These MUST bypass auth checks BEFORE any session validation
// Path-based bypass (does not rely on headers which may vary)
const bypassPaths = [
  '/api/cron',      // All cron endpoints (including /api/cron/run-outbound-jobs, /api/cron/debug)
  '/api/webhooks',  // All webhook endpoints
  '/api/jobs',      // All job runner endpoints
  '/api/health',   // Health check endpoints
]

// Check bypass FIRST (before any auth logic)
if (bypassPaths.some((p) => pathname.startsWith(p))) {
  const userAgent = req.headers.get('user-agent') || 'unknown'
  console.log(`[MIDDLEWARE] bypass path=${pathname} ua=${userAgent.substring(0, 50)}`)
  return NextResponse.next()
}
```

**Removed from publicPaths:**
- `/api/health` (now in bypassPaths)
- `/api/webhooks/meta-leads` (now covered by `/api/webhooks` bypass)
- `/api/webhooks/whatsapp` (now covered by `/api/webhooks` bypass)
- `/api/webhooks/instagram` (now covered by `/api/webhooks` bypass)

**Lines changed:** 6-23 (bypass logic added at top)

---

### 1. `src/lib/inbound/autoTasks.ts`
**Change:** Removed 10-minute delay from task creation

**Before:**
```typescript
dueAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
```

**After:**
```typescript
dueAt: new Date(), // Due immediately (no delay)
```

**Lines changed:** 41, 48

---

### 2. `src/app/api/webhooks/whatsapp/route.ts`
**Change:** Removed HTTP "kick" to job runner (webhook no longer depends on JOB_RUNNER_TOKEN)

**Before:**
```typescript
if (enqueueResult.wasDuplicate) {
  console.log(`⚠️ [WEBHOOK] Duplicate job blocked requestId=${requestId} inboundProviderMessageId=${messageId}`)
} else {
  // A) FIRE-AND-FORGET KICK: Trigger job runner immediately (don't await)
  // This ensures jobs process without waiting for cron, while keeping webhook fast
  const baseUrl = req.nextUrl.origin || `https://${req.headers.get('host') || 'localhost:3000'}`
  const jobRunnerUrl = `${baseUrl}/api/jobs/run-outbound?token=${process.env.JOB_RUNNER_TOKEN || 'dev-token-change-in-production'}&max=10`
  
  // Fire-and-forget: don't await, don't block webhook
  fetch(jobRunnerUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  }).catch((kickError: any) => {
    // Log but don't fail - job will be processed by cron if kick fails
    console.warn(`⚠️ [WEBHOOK] Job runner kick failed (non-critical) requestId=${requestId}:`, kickError.message)
  })
  
  console.log(`🚀 [WEBHOOK] Kicked job runner requestId=${requestId} inboundMessageId=${messageId}`)
}
```

**After:**
```typescript
if (enqueueResult.wasDuplicate) {
  console.log(`⚠️ [WEBHOOK] Duplicate job blocked requestId=${requestId} inboundProviderMessageId=${messageId}`)
} else {
  // Job enqueued - will be processed by cron (runs every minute)
  // No HTTP kick - webhook must remain fast and independent
  console.log(`✅ [WEBHOOK] Job enqueued, will be processed by cron requestId=${requestId} jobId=${enqueueResult.jobId}`)
}
```

**Lines changed:** 595-614

---

### 3. `src/app/api/cron/debug/route.ts` (NEW FILE)
**Change:** Created debug endpoint to verify middleware bypass and inspect request headers

**Content:**
```typescript
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    path: req.nextUrl.pathname,
    host: req.headers.get('host'),
    userAgent: req.headers.get('user-agent'),
    xVercelCron: req.headers.get('x-vercel-cron'),
    hasAuthorization: !!req.headers.get('authorization'),
    hasTokenQuery: req.nextUrl.searchParams.has('token'),
    queryKeys: Array.from(req.nextUrl.searchParams.keys()),
  })
}
```

**Purpose:** Verify middleware bypass is working (should return 200, not 401)

---

### 4. `src/app/api/cron/run-outbound-jobs/route.ts`
**Change:** Added handler-reached log at the very top to confirm middleware didn't block

**Added:**
```typescript
// Log at the very top to confirm handler was reached
const vercelCronHeader = req.headers.get('x-vercel-cron')
const userAgent = req.headers.get('user-agent') || 'unknown'
console.log(`[CRON] reached handler requestId=${requestId} xVercelCron=${vercelCronHeader || 'N/A'} ua=${userAgent.substring(0, 50)}`)
```

**Lines changed:** 20-24

---

### 5. `src/lib/jobs/processOutboundJobs.ts`
**Changes:**
- Added logging for jobs not due yet (scheduled in future)
- Added logging for job claims
- Enhanced error logging for Meta API responses

**Added (before job query):**
```typescript
// First, check for jobs that are not due yet (for logging)
const notDueJobs = await prisma.$queryRaw<Array<{ id: number; runAt: Date }>>`
  SELECT id, "runAt"
  FROM "OutboundJob"
  WHERE status IN ('PENDING', 'READY_TO_SEND')
    AND "runAt" > NOW()
  LIMIT 5
`
if (notDueJobs.length > 0) {
  console.log(`⏰ [JOB-PROCESSOR] ${notDueJobs.length} job(s) not due yet (scheduled in future) source=${source} requestId=${requestId}`, 
    notDueJobs.map(j => ({ jobId: j.id, runAt: j.runAt.toISOString() }))
  )
}
```

**Added (in job claim logging):**
```typescript
console.log(`✅ [JOB-PROCESSOR] picked jobId=${job.id} requestId=${jobRequestId} conversationId=${job.conversationId} inboundProviderMessageId=${job.inboundProviderMessageId || 'N/A'} status=GENERATING claimedAt=${now.toISOString()}`)
```

**Added (in error handling):**
```typescript
// Log Meta API response if error contains WhatsApp API details
if (error.message && typeof error.message === 'string' && (error.message.includes('WhatsApp API') || error.message.includes('Meta'))) {
  console.error(`❌ [JOB-PROCESSOR] Meta API error response jobId=${job.id} requestId=${jobRequestId} errorMessage="${error.message}" errorCode=${error.code || 'N/A'}`)
}
```

**Lines changed:** 63-75, 132, 451-455

---

## Verification URLs

Replace `YOUR_DOMAIN` with your actual domain (e.g., `alainbcenter-crm.vercel.app`).
Replace `YOUR_CRON_SECRET` with your `CRON_SECRET` environment variable.
Replace `YOUR_JOB_RUNNER_TOKEN` with your `JOB_RUNNER_TOKEN` environment variable.

### 1. Test Cron Endpoint (Vercel Cron)
```
GET https://YOUR_DOMAIN/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET
```

**Expected response:**
```json
{
  "ok": true,
  "message": "Jobs processed",
  "processed": 0,
  "failed": 0,
  "jobIds": { "processed": [], "failed": [] },
  "requestId": "cron_...",
  "authMethod": "query",
  "elapsed": "...ms"
}
```

**Or if called by Vercel Cron (with x-vercel-cron header):**
```json
{
  "ok": true,
  "message": "Jobs processed",
  "processed": 0,
  "failed": 0,
  "jobIds": { "processed": [], "failed": [] },
  "requestId": "cron_...",
  "authMethod": "vercel",
  "elapsed": "...ms"
}
```

---

### 2. Test Job Runner (Manual Trigger)
```
GET https://YOUR_DOMAIN/api/jobs/run-outbound?token=YOUR_JOB_RUNNER_TOKEN&max=10
```

**Expected response:**
```json
{
  "ok": true,
  "processed": 0,
  "failed": 0,
  "jobIds": { "processed": [], "failed": [] },
  "message": "No jobs to process",
  "requestId": "manual_..."
}
```

---

### 3. Test Webhook (Send WhatsApp Message)
Send a WhatsApp message to your bot number. The webhook should:
- Return 200 OK within <300ms
- Enqueue a job (no HTTP kick)
- Log: `✅ [WEBHOOK] Job enqueued, will be processed by cron`

**Webhook endpoint:**
```
POST https://YOUR_DOMAIN/api/webhooks/whatsapp
```

---

## Log Patterns to Verify

### Middleware Bypass (CRITICAL)
Look for:
```
[MIDDLEWARE] bypass path=/api/cron/run-outbound-jobs ua=vercel-cron/1.0
[MIDDLEWARE] bypass path=/api/webhooks/whatsapp ua=Meta-WhatsApp/...
[MIDDLEWARE] bypass path=/api/jobs/run-outbound ua=Mozilla/...
```

**If you see 401 errors, you should NOT see these bypass logs** - this means middleware is not bypassing correctly.

### Cron Handler Reached
Look for:
```
[CRON] reached handler requestId=... xVercelCron=1 ua=vercel-cron/1.0
```

**If you see 401 errors, you should NOT see this log** - this means middleware blocked the request before the handler ran.

### Jobs Not Due Yet
Look for:
```
⏰ [JOB-PROCESSOR] X job(s) not due yet (scheduled in future) source=cron requestId=... [{ jobId: ..., runAt: "..." }]
```

### Job Claimed
Look for:
```
✅ [JOB-PROCESSOR] picked jobId=... requestId=... status=GENERATING claimedAt=2024-...
```

### Meta API Error
Look for:
```
❌ [JOB-PROCESSOR] Meta API error response jobId=... requestId=... errorMessage="..." errorCode=...
```

### Webhook Enqueue (No Kick)
Look for:
```
✅ [WEBHOOK] Job enqueued, will be processed by cron requestId=... jobId=...
```

**Should NOT see:**
```
🚀 [WEBHOOK] Kicked job runner
```

---

## Architecture Verification

✅ **Option 1 (Direct Function Calls) - VERIFIED:**
- `src/app/api/cron/run-outbound-jobs/route.ts` calls `processOutboundJobs()` directly (line 64)
- `src/app/api/jobs/run-outbound/route.ts` calls `processOutboundJobs()` directly (line 59)
- No HTTP fetch between cron and job runner

✅ **Webhook Independence - VERIFIED:**
- Webhook only enqueues jobs (no HTTP kick)
- Webhook does not depend on `JOB_RUNNER_TOKEN`
- Jobs are processed by cron (runs every minute)

✅ **Cron Auth - VERIFIED:**
- Accepts any truthy `x-vercel-cron` header (line 34)
- Accepts `Authorization: Bearer CRON_SECRET` (line 35)
- Accepts `?token=CRON_SECRET` (line 35)
- Always returns JSON (never HTML)

✅ **Dynamic Export - VERIFIED:**
- `src/app/api/webhooks/whatsapp/route.ts`: `export const dynamic = 'force-dynamic'` ✅
- `src/app/api/jobs/run-outbound/route.ts`: `export const dynamic = 'force-dynamic'` ✅
- `src/app/api/cron/run-outbound-jobs/route.ts`: `export const dynamic = 'force-dynamic'` ✅

---

## Testing Checklist

### Middleware Bypass (CRITICAL)
- [ ] Test `/api/cron/debug` → returns 200 (not 401)
- [ ] Check logs → see `[MIDDLEWARE] bypass path=/api/cron/debug`
- [ ] Test `/api/cron/run-outbound-jobs?token=...` → returns 200 (not 401)
- [ ] Check logs → see `[MIDDLEWARE] bypass path=/api/cron/run-outbound-jobs`
- [ ] Check logs → see `[CRON] reached handler` (confirms handler was reached)
- [ ] Test `/api/jobs/run-outbound?token=...` → returns 200 (not 401)
- [ ] Check logs → see `[MIDDLEWARE] bypass path=/api/jobs/run-outbound`

### Message Delivery
- [ ] Send WhatsApp message → webhook returns <300ms
- [ ] Check logs → see "Job enqueued, will be processed by cron" (no kick)
- [ ] Check logs → see `[MIDDLEWARE] bypass path=/api/webhooks/whatsapp`
- [ ] Wait 1 minute → cron processes job
- [ ] Check logs → see job processing logs
- [ ] Verify message sent → check WhatsApp
- [ ] Verify message appears in inbox UI
- [ ] Verify no 10-minute delay in task creation

---

## Notes

- Jobs are now eligible immediately (no delay)
- Webhook is completely independent (no HTTP dependencies)
- Cron processes jobs every minute (configured in `vercel.json`)
- All logging is structured and grep-friendly


