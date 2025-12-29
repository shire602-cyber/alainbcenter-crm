# WhatsApp Webhook Reliability - Never Fail, Never Duplicate, Premium UX

## Overview

This document explains the production architecture for reliable WhatsApp webhook processing with:
- **Never Fail**: Job queue pattern ensures webhook returns <300ms, orchestration happens async
- **Never Duplicate**: Hard idempotency at multiple layers (job queue, outbound send)
- **Premium UX**: Consistent conversation flow, no service lists, branded greeting

## Architecture: Job Queue Pattern

### Previous Approach (Removed)
- Webhook waited for orchestrator (12s timeout)
- Risk of webhook timeouts
- No retry mechanism
- Fragile under load

### New Approach (Implemented)
- **Webhook**: Fast enqueue (<300ms return)
- **Job Runner**: Async processing with retries
- **Idempotency**: Multiple layers prevent duplicates

## 1) Webhook Must Be Fast + Async Orchestration

### Implementation

**A) Webhook Route (`/api/webhooks/whatsapp`)**
```typescript
// 1. Validate payload
// 2. Ignore status-only events (already done)
// 3. For message events:
//    - Persist inbound message (via autoMatchPipeline)
//    - Enqueue job: OutboundJob { status='queued', runAt=now }
//    - Return 200 immediately (<300ms target)
```

**B) Job Runner (`/api/jobs/run-outbound`)**
```typescript
// 1. Pick queued jobs with FOR UPDATE SKIP LOCKED (PostgreSQL)
// 2. Mark job 'running'
// 3. Run orchestrator
// 4. Send outbound via sendWithIdempotency
// 5. Mark job 'done'
// 6. Retry with exponential backoff on transient errors
```

**C) Idempotency Layers**
1. **Job Queue**: Unique constraint on `inboundProviderMessageId` prevents duplicate jobs
2. **Outbound Send**: `outboundDedupeKey = ${conversationId}:${inboundProviderMessageId}:${questionKey || 'reply'}` with unique constraint
3. **Message Log**: `OutboundMessageLog` tracks all sends

### Database Schema

```prisma
model OutboundJob {
  id                       Int       @id @default(autoincrement())
  conversationId          Int
  inboundMessageId        Int?
  inboundProviderMessageId String?  @unique // Prevents duplicate jobs
  status                  String    @default("queued") // queued | running | done | failed
  runAt                   DateTime  @default(now())
  attempts                Int       @default(0)
  maxAttempts             Int       @default(3)
  error                   String?
  requestId               String?
  createdAt               DateTime  @default(now())
  startedAt               DateTime?
  completedAt             DateTime?

  @@index([status, runAt]) // For job runner to pick queued jobs
}
```

### Benefits
- ✅ Webhook returns <300ms (no orchestrator wait)
- ✅ Orchestrator can take as long as needed (no timeout)
- ✅ Automatic retries with exponential backoff
- ✅ No duplicate sends (multiple idempotency layers)
- ✅ Scales under load (job queue handles concurrency)

### Running Job Runner

**Option 1: Cron Job (Recommended)**
```bash
# Add to Vercel Cron or external cron service
# Calls: GET /api/cron/run-outbound-jobs?token=...
# Runs every 30 seconds
```

**Option 2: Manual Trigger**
```bash
curl "https://your-domain.com/api/jobs/run-outbound?token=YOUR_TOKEN&max=10"
```

## 2) Fix Conversation UX Order

### Required Flow

1. **First Outbound Message (Only Once Per Conversation)**
   ```
   "Hi 👋 I'm ABCai from Al Ain Business Center."
   ```
   - Applied via `withGlobalGreeting()` in `sendWithIdempotency.ts`
   - Only on first outbound message (tracked via `conversation.knownFields.firstGreetingSentAt`)

2. **First Question (Service)**
   ```
   "How can I help you today?"
   ```
   - NO service list
   - NO examples
   - Simple, open-ended question

3. **After Service Intent Detected**
   - Ask for missing fields in this order:
     1. Full name
     2. Nationality
   - Then proceed to quotation handoff (email + best time to call)

4. **Remove Name-Before-Service Path**
   - Unless user already clearly stated service in first message
   - Priority order: service → name → nationality

### Implementation

**Orchestrator Priority Order** (`src/lib/ai/orchestrator.ts`):
```typescript
// NEW priority order: service first, then name, then nationality
if (!conversationState.knownFields.service) {
  // First question: "How can I help you today?"
  nextCoreQuestion = {
    questionKey: 'ASK_SERVICE',
    question: 'How can I help you today?',
  }
} else if (!conversationState.knownFields.name) {
  // Second: Ask name (only after service is known)
  nextCoreQuestion = {
    questionKey: 'ASK_NAME',
    question: 'May I know your full name, please?',
  }
} else if (!conversationState.knownFields.nationality) {
  // Third: Ask nationality (only after service and name are known)
  nextCoreQuestion = {
    questionKey: 'ASK_NATIONALITY',
    question: 'What is your nationality?',
  }
}
```

## 3) Make "No Service List" Impossible

### Code Paths Removed

1. **Orchestrator**: Service question is now "How can I help you today?" (no list)
2. **Rule Engine**: Removed service list from templates
3. **Service Detection**: Uses in-code keyword map (no file dependency)
4. **Outbound Sanitizer**: Last line of defense (removes service lists if they somehow appear)

### Sanitizer (Last Line of Defense)

```typescript
// In sendWithIdempotency.ts
const serviceListPattern = /\([^)]*(?:Visa|Permit|Setup|Services)[^)]*\)/gi
if (serviceListPattern.test(text)) {
  console.warn(`⚠️ [OUTBOUND] Blocked service list in outbound text - sanitizing`)
  text = text.replace(serviceListPattern, '')
  text = text.trim()
  // If empty, use fallback: "How can I help you today?"
  if (!text || text.length === 0) {
    text = 'How can I help you today?'
  }
}
```

### Test Coverage

- `src/lib/outbound/__tests__/noServiceList.test.ts`: Fails if outbound includes "/" between service words or contains "(Family Visa" etc.

## 4) Observability

### Structured Logging

All logs include `requestId` and `inboundMessageId` for tracing:

```typescript
// Webhook received
console.log(`[WEBHOOK] INBOUND-ENTRY requestId=${requestId}`, { ... })

// Job enqueued
console.log(`✅ [JOB-ENQUEUE] Job ${jobId} enqueued requestId=${requestId}`)

// Job started
console.log(`🔄 [JOB-RUNNER] Processing job ${jobId} requestId=${requestId}`)

// Orchestrator finished
console.log(`🎯 [JOB-RUNNER] Orchestrator completed requestId=${requestId}`)

// Outbound sent
console.log(`📤 [JOB-RUNNER] Sending outbound requestId=${requestId} outboundKey=${outboundKey}`)

// Outbound skipped (idempotency)
console.log(`⚠️ [JOB-RUNNER] Duplicate outbound blocked requestId=${requestId} outboundKey=${outboundKey}`)
```

### Dashboard Metrics (Optional)

**Endpoint**: `GET /api/jobs/metrics?token=...`

Returns:
- Queued jobs count
- Running jobs count
- Failed jobs count (last 24h)
- Average processing time
- Success rate

## A) Hard-Ignore Status-Only Webhook Events

### Implementation

Early return in webhook handler if payload has no messages:

```typescript
const hasMessages = value?.messages && Array.isArray(value.messages) && value.messages.length > 0
const hasStatuses = value?.statuses && Array.isArray(value.statuses) && value.statuses.length > 0

if (!hasMessages && hasStatuses) {
  // Status-only webhook - process statuses and return immediately
  console.log(`📊 [WEBHOOK] Status-only webhook - processing statuses only`)
} else if (!hasMessages) {
  // No messages and no statuses - invalid webhook
  return NextResponse.json({ success: true, message: 'No messages or statuses to process' })
}
```

### Benefits
- ✅ No orchestrator calls for status-only events
- ✅ No job enqueuing for status-only events
- ✅ Faster webhook response times

## E) Notifications Schema Mismatch Fix

### Implementation

Guard code in `/api/notifications` route handles missing `snoozedUntil` column:

```typescript
try {
  notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { snoozedUntil: null },
        { snoozedUntil: { lt: new Date() } },
      ],
    },
    // ...
  })
} catch (schemaError: any) {
  // If snoozedUntil column doesn't exist, query without it
  if (schemaError.message?.includes('snoozedUntil') || schemaError.code === 'P2021') {
    notifications = await prisma.notification.findMany({
      // Query without snoozedUntil
    })
  }
}
```

### Migration Instructions

To add the column to production:

```bash
# On production server
npx prisma migrate deploy
```

Or manually:
```sql
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP;
```

## Testing

### Test Files

1. **`src/app/api/webhooks/whatsapp/__tests__/statusOnlyWebhook.test.ts`**
   - Verifies status-only events return 200 immediately
   - Verifies orchestrator is NOT called for status-only events

2. **`src/app/api/webhooks/whatsapp/__tests__/jobQueue.test.ts`**
   - Verifies webhook returns quickly and enqueues job
   - Verifies job enqueue happens <300ms

3. **`src/app/api/jobs/__tests__/runOutbound.test.ts`**
   - Verifies job runner sends exactly one outbound even if webhook is called twice
   - Verifies retry logic with exponential backoff

4. **`src/lib/outbound/__tests__/noServiceList.test.ts`**
   - Fails if outbound includes "/" between service words
   - Fails if outbound contains "(Family Visa" etc.

### Running Tests

```bash
npm test -- src/app/api/webhooks/whatsapp/__tests__/
npm test -- src/app/api/jobs/__tests__/
npm test -- src/lib/outbound/__tests__/noServiceList.test.ts
```

## Production Deployment

### 1. Deploy Code Changes

```bash
git push origin master
# Vercel will auto-deploy
```

### 2. Run Migration

```bash
npx prisma migrate deploy
```

### 3. Set Environment Variables

```bash
# Job runner token (for /api/jobs/run-outbound)
JOB_RUNNER_TOKEN=your-secure-token-here

# Cron secret (for /api/cron/run-outbound-jobs)
CRON_SECRET=your-cron-secret-here
```

### 4. Configure Cron Job

**Vercel Cron** (`vercel.json`):
```json
{
  "crons": [{
    "path": "/api/cron/run-outbound-jobs",
    "schedule": "*/30 * * * * *"
  }]
}
```

**Or External Cron Service**:
```bash
# Every 30 seconds
*/30 * * * * * curl "https://your-domain.com/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET"
```

### 5. Monitor

Watch for these log patterns:
- `📊 [WEBHOOK] Status-only webhook` - Status events being ignored ✅
- `✅ [JOB-ENQUEUE] Job X enqueued` - Jobs being enqueued ✅
- `🔄 [JOB-RUNNER] Processing job X` - Jobs being processed ✅
- `⚠️ [OUTBOUND] Blocked service list` - Service list sanitization ✅
- `⚠️ [JOB-RUNNER] Duplicate outbound blocked` - Idempotency working ✅

## Summary

| Feature | Status | Impact |
|---------|--------|--------|
| Job Queue Pattern | ✅ Implemented | Webhook <300ms, async orchestration |
| Status-Only Ignore | ✅ Implemented | Prevents unnecessary processing |
| Conversation UX Order | ✅ Implemented | Service → Name → Nationality |
| No Service Lists | ✅ Implemented | Consistent UX, no file dependency |
| Structured Logging | ✅ Implemented | Full traceability with requestId |
| Idempotency (Multi-Layer) | ✅ Implemented | Never duplicate sends |
| Tests | ✅ Added | Ensures fixes work correctly |
| Notifications Schema Fix | ✅ Implemented | Prevents production errors |

## Architecture Diagram

```
WhatsApp Webhook
    ↓
[Validate Payload]
    ↓
[Status-Only?] → Yes → [Process Statuses] → [Return 200]
    ↓ No
[Auto-Match Pipeline] → [Create/Update Contact/Lead/Conversation]
    ↓
[Enqueue OutboundJob] → [Return 200 <300ms]
    ↓
[Job Runner (Cron/Manual)]
    ↓
[Pick Queued Jobs (FOR UPDATE SKIP LOCKED)]
    ↓
[Run Orchestrator]
    ↓
[Send Outbound (with Idempotency)]
    ↓
[Mark Job Done]
```

## Key Files

- `src/app/api/webhooks/whatsapp/route.ts` - Webhook handler (enqueues jobs)
- `src/lib/jobs/enqueueOutbound.ts` - Job enqueueing logic
- `src/app/api/jobs/run-outbound/route.ts` - Job runner
- `src/app/api/cron/run-outbound-jobs/route.ts` - Cron trigger
- `src/lib/ai/orchestrator.ts` - Orchestrator (service → name → nationality)
- `src/lib/outbound/sendWithIdempotency.ts` - Outbound send with idempotency + sanitizer
- `prisma/schema.prisma` - OutboundJob model
- `prisma/migrations/20250129000000_add_outbound_job_queue/migration.sql` - Migration
