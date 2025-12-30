# Fix Summary - Cron Auth + DB Mismatch Fallback

## Files Changed

### 1. `src/app/api/cron/run-outbound-jobs/route.ts`
**Changes:**
- Simplified auth logic to match exact requirements
- Support for: (a) Vercel Cron header `x-vercel-cron` (any truthy value), (b) `Authorization: Bearer <CRON_SECRET>`, (c) Query param `?token=<CRON_SECRET>`
- Logs: `✅ [CRON] authorized method=vercel|bearer|query vercelHeaderValue="..."`
- Unauthorized logs show: `hasVercelHeader`, `vercelHeaderValue`, `hasAuthHeader`, `hasTokenQuery` (no secrets)

**Key Changes:**
```typescript
const vercelCronHeader = req.headers.get('x-vercel-cron')
const authHeader = req.headers.get('authorization')
const tokenQuery = req.nextUrl.searchParams.get('token')

const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
const isVercelCron = !!vercelCronHeader
const isSecretOk = (bearer && bearer === CRON_SECRET) || (tokenQuery && tokenQuery === CRON_SECRET)

if (!isVercelCron && !isSecretOk) {
  console.warn(`[CRON] unauthorized requestId=${requestId}`, {
    hasVercelHeader: isVercelCron,
    vercelHeaderValue: vercelCronHeader || null,
    hasAuthHeader: !!authHeader,
    hasTokenQuery: !!tokenQuery,
  })
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const authMethod = isVercelCron ? 'vercel' : (bearer ? 'bearer' : 'query')
console.log(`✅ [CRON] authorized method=${authMethod} requestId=${requestId} vercelHeaderValue="${vercelCronHeader || 'N/A'}"`)
```

### 2. `src/app/api/inbox/conversations/route.ts`
**Changes:**
- Already has defensive code for `deletedAt` (from previous fix)
- No changes needed

### 3. `src/app/api/inbox/conversations/[id]/route.ts`
**Changes:**
- Added defensive code for `deletedAt` property access
- Uses safe property access: `(conversation as any).deletedAt`

**Key Changes:**
```typescript
// Defensive: deletedAt may not exist in DB (migration not applied) - access safely
const isArchived = (conversation as any).deletedAt !== null && (conversation as any).deletedAt !== undefined
```

### 4. `src/app/api/inbox/refresh-intelligence/route.ts`
**Changes:**
- Added defensive code for `deletedAt` filter (P2022 handling)
- Retries query without `deletedAt` filter if column doesn't exist

**Key Changes:**
```typescript
let conversations
try {
  conversations = await prisma.conversation.findMany({
    where: {
      channel: 'whatsapp',
      status: 'open',
      deletedAt: null,
    },
  })
} catch (error: any) {
  if (error.code === 'P2022' || error.message?.includes('does not exist')) {
    console.warn('⚠️ [REFRESH-INTELLIGENCE] deletedAt column not found - migration not applied.')
    conversations = await prisma.conversation.findMany({
      where: {
        channel: 'whatsapp',
        status: 'open',
      },
    })
  } else {
    throw error
  }
}
```

### 5. `src/app/api/notifications/route.ts`
**Changes:**
- Already has defensive code for `snoozedUntil` (from previous fix)
- No changes needed

### 6. `src/app/api/jobs/run-outbound/route.ts`
**Changes:**
- Added structured logging: `✅ [JOB-RUNNER] picked jobId=... conversationId=... inboundProviderMessageId=...`
- Added logging before send: `📤 [JOB-RUNNER] before sendOutboundWithIdempotency jobId=... phone=...`
- Added logging after send: `✅ [JOB-RUNNER] outbound sent jobId=... messageId=... conversationId=... phone=... success=true`

**Key Changes:**
```typescript
console.log(`✅ [JOB-RUNNER] picked jobId=${job.id} requestId=${requestId} conversationId=${job.conversationId} inboundProviderMessageId=${job.inboundProviderMessageId || 'N/A'}`)

console.log(`📤 [JOB-RUNNER] before sendOutboundWithIdempotency jobId=${job.id} requestId=${requestId} conversationId=${conversation.id} phone=${phoneForOutbound} inboundProviderMessageId=${inboundProviderMessageId || 'N/A'}`)

console.log(`✅ [JOB-RUNNER] outbound sent jobId=${job.id} requestId=${requestId} messageId=${sendResult.messageId} conversationId=${conversation.id} phone=${phoneForOutbound} inboundProviderMessageId=${inboundProviderMessageId || 'N/A'} success=${sendResult.success}`)
```

### 7. `docs/PRODUCTION_CHECKLIST.md`
**Changes:**
- Updated with exact log patterns to look for
- Added manual test command with query token
- Updated required env vars list

---

## Verification

✅ **Build:** Compiled successfully  
✅ **Linter:** No errors  
✅ **TypeScript:** No type errors

---

## Required Vercel Environment Variables

Set in Vercel Dashboard → Settings → Environment Variables:

- `CRON_SECRET` (REQUIRED)
- `JOB_RUNNER_TOKEN` (REQUIRED)
- `WHATSAPP_ACCESS_TOKEN` (REQUIRED)
- `WHATSAPP_PHONE_NUMBER_ID` (REQUIRED)
- `DATABASE_URL` (REQUIRED)
- `DIRECT_URL` (REQUIRED)

---

## Expected Logs After Deployment

### Cron Running Automatically:
```
[CRON] trigger start requestId=...
✅ [CRON] authorized method=vercel requestId=... vercelHeaderValue="1"
[CRON] calling job runner requestId=...
[CRON] job runner response requestId=... statusCode=200
```

### Manual Test:
```bash
curl "https://your-domain.vercel.app/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET"
```

Expected logs:
```
✅ [CRON] authorized method=query requestId=... vercelHeaderValue="N/A"
```

### Job Processing:
```
📦 [JOB-RUNNER] Processing 1 job(s)
✅ [JOB-RUNNER] picked jobId=123 conversationId=456 inboundProviderMessageId=msg_abc
🎯 [JOB-RUNNER] Running orchestrator for job 123
✅ [JOB-RUNNER] Orchestrator complete jobId=123 elapsed=1234ms
📤 [JOB-RUNNER] before sendOutboundWithIdempotency jobId=123 phone=+971501234567 inboundProviderMessageId=msg_abc
✅ [JOB-RUNNER] outbound sent jobId=123 messageId=wamid.xxx conversationId=456 phone=+971501234567 success=true
```

---

## Production Checklist

See `docs/PRODUCTION_CHECKLIST.md` for complete step-by-step verification.

