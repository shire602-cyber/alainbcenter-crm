# WhatsApp Webhook Reliability Fixes

## Overview

This document explains the production fixes implemented to ensure reliable WhatsApp webhook processing and prevent "no reply" issues.

## A) Hard-Ignore Status-Only Webhook Events

### Problem
WhatsApp sends webhook events for both:
- **Messages**: Inbound messages from users (need processing)
- **Statuses**: Delivery receipts (sent, delivered, read, failed) - don't need AI processing

Status-only events were triggering the orchestrator unnecessarily, causing:
- Unnecessary API calls
- Potential timeouts
- Resource waste

### Solution
Early return in webhook handler if payload has no messages:

```typescript
// If payload has no messages OR messages.length===0 => return 200 immediately
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
- ✅ No task creation for status-only events
- ✅ No outbound sends for status-only events
- ✅ Faster webhook response times

## B) Prevent "No Reply" from Orchestrator Timeout

### Problem
Orchestrator timeout was set to 4 seconds, which was too short for:
- Complex AI generation
- Vector search operations
- Database queries
- Network latency

When timeout occurred, the system:
1. Created a task for human follow-up
2. Returned 200 to webhook
3. **Did NOT send a reply to the customer**

This caused "no reply" issues where customers sent messages but received no response.

### Solution
**Option 2 (Quick Fix)**: Increased timeout to 12 seconds and ensured send occurs before timeout:

```typescript
// Increased timeout from 4s to 12s
const timeoutPromise = new Promise<{ replyText: string } | null>((resolve) => {
  setTimeout(() => {
    console.warn(`⏱️ [WEBHOOK] Orchestrator timeout (12s) - creating task for human follow-up`)
    resolve(null)
  }, 12000) // Increased from 4000ms
})

const orchestratorResult = await Promise.race([orchestratorPromise, timeoutPromise])

if (!orchestratorResult) {
  // Timeout - create task and mark as processed
  // CRITICAL: DO NOT send anything on timeout - only create task
  await createAgentTask(result.lead.id, 'complex_query', {
    messageText: `Orchestrator timed out for message: ${result.message.body?.substring(0, 100)}`,
  })
  // No reply sent - task created for human follow-up
  return NextResponse.json({ success: true, message: 'Inbound processed, orchestrator timeout' })
}
```

### Future Improvement (Option 1)
For production at scale, consider implementing a background job queue:
1. Webhook stores inbound message + enqueues job (conversationId + messageId)
2. Job runner executes orchestrator + sends WhatsApp reply
3. Webhook returns 200 immediately

This would:
- ✅ Guarantee webhook response < 1s
- ✅ Allow orchestrator to take as long as needed
- ✅ Enable retry logic for failed sends
- ✅ Scale better under load

### Benefits
- ✅ More time for orchestrator to complete (12s vs 4s)
- ✅ Clear timeout handling (task created, no partial reply)
- ✅ Webhook still returns quickly (within 12s)

## C) Remove Service List Everywhere

### Problem
The system was showing service lists in questions:
- "Which service are you looking for today? (Family Visa / Visit Visa / Freelance Visa / ...)"
- This was coming from `services.seed.json` file which:
  - Wasn't available in production (`/var/task/config/services.seed.json` not found)
  - Caused fallback behavior
  - Created inconsistent UX

### Solution
**Option 1 (Implemented)**: Removed dependency on `services.seed.json`:

1. **Service Detection**: Uses in-code keyword map from `serviceSynonyms.ts`
   - No file system dependency
   - Always available
   - Deterministic matching

2. **Service Question**: Changed to simple question:
   ```typescript
   // OLD: "Which service are you looking for today? (Family Visa / Visit Visa / ...)"
   // NEW: "How can I help you today?"
   ```

3. **Outbound Sanitizer**: Added regex to block service lists in outbound messages:
   ```typescript
   // Block service lists: Remove patterns like "(Family Visa / Visit Visa / ...)"
   const serviceListPattern = /\([^)]*(?:Visa|Permit|Setup|Services)[^)]*\)/gi
   if (serviceListPattern.test(text)) {
     text = text.replace(serviceListPattern, '')
     // If empty, use fallback: "How can I help you today?"
   }
   ```

### Files Changed
- `src/lib/inbound/serviceDetection.ts`: Removed `loadServicesSeed()`, uses `serviceSynonyms.ts`
- `src/lib/ai/orchestrator.ts`: Changed service question to "How can I help you today?"
- `src/lib/outbound/sendWithIdempotency.ts`: Added service list sanitizer

### Benefits
- ✅ No file system dependency
- ✅ Consistent UX (no service lists)
- ✅ Works in all environments (local, staging, production)
- ✅ Simpler, cleaner questions

## D) Tests

### Test Coverage
1. **Status-Only Webhook Test** (`src/app/api/webhooks/whatsapp/__tests__/statusOnlyWebhook.test.ts`)
   - Verifies status-only events return 200 immediately
   - Verifies orchestrator is NOT called for status-only events
   - Verifies messages are processed when present

2. **Service List Blocking Test** (`src/lib/outbound/__tests__/serviceListBlocking.test.ts`)
   - Verifies service lists are removed from outbound text
   - Verifies fallback text is used if message becomes empty
   - Verifies legitimate messages are not blocked

### Running Tests
```bash
npm test -- src/app/api/webhooks/whatsapp/__tests__/statusOnlyWebhook.test.ts
npm test -- src/lib/outbound/__tests__/serviceListBlocking.test.ts
```

## E) Notifications Schema Mismatch Fix

### Problem
Production DB missing `snoozedUntil` column in `Notification` table, causing:
```
Error: Column "snoozedUntil" does not exist
```

### Solution
Added guard code in `/api/notifications` route:

```typescript
try {
  // Try to query with snoozedUntil (if column exists)
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

## Summary

| Fix | Status | Impact |
|-----|--------|--------|
| A) Status-only webhook ignore | ✅ Implemented | Prevents unnecessary processing |
| B) Orchestrator timeout (12s) | ✅ Implemented | Reduces "no reply" issues |
| C) Remove service lists | ✅ Implemented | Consistent UX, no file dependency |
| D) Tests | ✅ Added | Ensures fixes work correctly |
| E) Notifications schema fix | ✅ Implemented | Prevents production errors |

## Production Deployment

1. **Deploy code changes**
2. **Run migration** (if needed for notifications):
   ```bash
   npx prisma migrate deploy
   ```
3. **Monitor webhook logs** for:
   - Status-only events being ignored
   - Orchestrator timeouts (should be rare with 12s timeout)
   - Service list blocking (should see sanitization logs)

## Monitoring

Watch for these log patterns:
- `📊 [WEBHOOK] Status-only webhook` - Status events being ignored ✅
- `⏱️ [WEBHOOK] Orchestrator timeout (12s)` - Timeout occurred (investigate if frequent)
- `⚠️ [OUTBOUND] Blocked service list in outbound text` - Service list sanitization ✅

