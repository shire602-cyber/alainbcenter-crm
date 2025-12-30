# Production Checklist - WhatsApp Replies Verification

## Pre-Deployment

### 1. Environment Variables (Vercel Dashboard)

Set all required environment variables in Vercel Dashboard → Settings → Environment Variables:

**Database:**
- ✅ `DATABASE_URL` - PostgreSQL connection string (pooler)
- ✅ `DIRECT_URL` - PostgreSQL direct connection

**Authentication:**
- ✅ `AUTH_SECRET` - NextAuth secret
- ✅ `SESSION_SECRET` - Session encryption key

**WhatsApp / Meta:**
- ✅ `WHATSAPP_ACCESS_TOKEN` - Meta Cloud API access token (REQUIRED)
- ✅ `WHATSAPP_PHONE_NUMBER_ID` - Meta phone number ID (REQUIRED)
- ✅ `WHATSAPP_VERIFY_TOKEN` - Webhook verification token
- ✅ `WHATSAPP_APP_SECRET` - Meta app secret (optional)

**Automation / Cron:**
- ✅ `CRON_SECRET` - Secret for cron endpoint auth (REQUIRED)
- ✅ `JOB_RUNNER_TOKEN` - Secret for job runner auth (REQUIRED)

**AI (Optional):**
- ✅ `OPENAI_API_KEY` - OpenAI API key (for embeddings fallback)
- ✅ `DEEPSEEK_API_KEY` - DeepSeek API key (primary AI)

### 2. Database Migrations

Run migrations on production database:

```bash
# Option 1: Via Prisma (recommended)
DATABASE_URL="your-production-db-url" npx prisma migrate deploy

# Option 2: Via Neon Dashboard SQL Editor
# Run SQL from: prisma/migrations/20250130000000_add_conversation_soft_delete/migration.sql
# Run SQL from: prisma/migrations/20251229190109_add_notification_snoozed_until/migration.sql
```

**Verify migrations:**
```sql
-- Check deletedAt column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'Conversation' AND column_name = 'deletedAt';

-- Check snoozedUntil column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'Notification' AND column_name = 'snoozedUntil';
```

### 3. Vercel Cron Configuration

Verify `vercel.json` has cron job configured:

```json
{
  "crons": [
    {
      "path": "/api/cron/run-outbound-jobs",
      "schedule": "* * * * *"
    }
  ]
}
```

**Verify in Vercel Dashboard:**
- Go to Vercel Dashboard → Your Project → Cron Jobs
- Confirm `/api/cron/run-outbound-jobs` is listed
- Schedule: `* * * * *` (every minute)
- Status: Enabled

---

## Post-Deployment Verification

### Step 1: Verify Cron is Running

1. **Check Vercel Cron Logs:**
   - Vercel Dashboard → Your Project → Cron Jobs → `/api/cron/run-outbound-jobs` → View Logs
   - Look for: `[CRON] trigger start requestId=...`
   - Look for: `[CRON] authorized via vercel`
   - Look for: `[CRON] job runner response statusCode=200`

2. **Manual Test (if needed):**
   ```bash
   curl "https://your-domain.vercel.app/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET"
   ```
   Expected: `{"ok": true, "message": "Job runner triggered", ...}`

### Step 2: Verify Webhook Enqueues Jobs

1. **Send a WhatsApp message** to your business number

2. **Check Vercel Function Logs:**
   - Vercel Dashboard → Your Project → Functions → `/api/webhooks/whatsapp` → Logs
   - Look for: `[WEBHOOK] INBOUND-ENTRY requestId=...`
   - Look for: `✅ [WEBHOOK] Job enqueued requestId=... jobId=... elapsed=...ms`
   - Look for: `🚀 [WEBHOOK] Kicked job runner requestId=...`
   - **Target:** Webhook should return <300ms

3. **Check Database:**
   ```sql
   SELECT id, status, "conversationId", "inboundProviderMessageId", "runAt", attempts
   FROM "OutboundJob"
   WHERE status = 'queued'
   ORDER BY "createdAt" DESC
   LIMIT 5;
   ```
   Expected: At least one `queued` job for your test message

### Step 3: Verify Job Runner Processes Jobs

1. **Wait 1-2 minutes** (cron runs every minute)

2. **Check Vercel Function Logs:**
   - Vercel Dashboard → Your Project → Functions → `/api/jobs/run-outbound` → Logs
   - Look for: `📦 [JOB-RUNNER] Processing X job(s)`
   - Look for: `✅ [JOB-RUNNER] picked jobId=... conversationId=... inboundProviderMessageId=...`
   - Look for: `🎯 [JOB-RUNNER] Running orchestrator for job X`
   - Look for: `✅ [JOB-RUNNER] Orchestrator complete jobId=... elapsed=...ms`
   - Look for: `📤 [JOB-RUNNER] before sendOutboundWithIdempotency jobId=... phone=...`
   - Look for: `✅ [JOB-RUNNER] outbound sent jobId=... messageId=... conversationId=... phone=... success=true`

3. **Check Database:**
   ```sql
   -- Check job status
   SELECT id, status, "conversationId", error, "completedAt"
   FROM "OutboundJob"
   WHERE "inboundProviderMessageId" = 'YOUR_TEST_MESSAGE_ID'
   ORDER BY "createdAt" DESC
   LIMIT 1;
   ```
   Expected: `status = 'done'` (not `queued` or `failed`)

### Step 4: Verify Outbound Message Appears in Inbox

1. **Check Database:**
   ```sql
   -- Check Message row was created
   SELECT id, direction, channel, body, "providerMessageId", status, "sentAt"
   FROM "Message"
   WHERE "conversationId" = YOUR_CONVERSATION_ID
   AND direction = 'OUTBOUND'
   ORDER BY "createdAt" DESC
   LIMIT 1;
   ```
   Expected: One `OUTBOUND` message with `status = 'SENT'`

2. **Check Inbox UI:**
   - Open your application → Inbox
   - Find the conversation with your test contact
   - Verify:
     - ✅ Inbound message appears
     - ✅ Outbound AI reply appears
     - ✅ Both messages in same conversation thread
     - ✅ Timestamps are correct

3. **Check WhatsApp:**
   - Open WhatsApp on test phone
   - Verify you received the AI reply
   - Verify reply text matches what's in the database

### Step 5: Verify No Duplicate Replies

1. **Send the same message again** (webhook retry simulation)

2. **Check Logs:**
   - Look for: `⚠️ [WEBHOOK] Duplicate job blocked requestId=...`
   - Look for: `⚠️ [JOB-RUNNER] Duplicate outbound blocked jobId=...`

3. **Check Database:**
   ```sql
   -- Should only be one outbound message per inbound
   SELECT "conversationId", COUNT(*) as outbound_count
   FROM "Message"
   WHERE direction = 'OUTBOUND'
   AND "conversationId" = YOUR_CONVERSATION_ID
   GROUP BY "conversationId";
   ```
   Expected: Only one outbound message (no duplicates)

---

## Troubleshooting

### Issue: Cron returns 401

**Check:**
- Vercel cron sends `x-vercel-cron` header (should auto-authorize)
- Manual test with `?token=CRON_SECRET` works
- `CRON_SECRET` is set in Vercel environment variables

**Fix:**
- Verify `CRON_SECRET` in Vercel Dashboard
- Check cron route logs for authorization method

### Issue: Jobs stay in "queued" status

**Check:**
- Cron is running (check Vercel Cron logs)
- Job runner endpoint is accessible
- `JOB_RUNNER_TOKEN` is set correctly

**Fix:**
- Verify `JOB_RUNNER_TOKEN` in Vercel environment variables
- Manually trigger job runner: `GET /api/jobs/run-outbound?token=JOB_RUNNER_TOKEN`
- Check job runner logs for errors

### Issue: Outbound messages not appearing in Inbox

**Check:**
- Message row was created in database
- `sendWithIdempotency` completed successfully
- No errors in job runner logs

**Fix:**
- Check `Message` table for outbound records
- Verify `conversationId` matches
- Check inbox query includes `OUTBOUND` messages

### Issue: Webhook returns >300ms

**Check:**
- Job enqueue is fast (<50ms)
- No blocking operations in webhook
- Fire-and-forget kick is non-blocking

**Fix:**
- Verify job enqueue doesn't await orchestrator
- Check webhook logs for slow operations
- Ensure kick is fire-and-forget (no await)

### Issue: Schema mismatch errors (P2022)

**Check:**
- Migrations were applied
- `deletedAt` column exists in `Conversation` table
- `snoozedUntil` column exists in `Notification` table

**Fix:**
- Run migrations: `npx prisma migrate deploy`
- Or apply SQL manually via Neon Dashboard
- Defensive code will handle gracefully, but fix root cause

---

## Success Criteria

✅ **Webhook:** Returns <300ms, enqueues job  
✅ **Cron:** Runs every minute, processes jobs  
✅ **Job Runner:** Processes queued jobs, sends outbound  
✅ **Message Row:** Created for outbound replies  
✅ **Inbox UI:** Shows outbound replies  
✅ **WhatsApp:** User receives AI reply  
✅ **No Duplicates:** Same message doesn't trigger duplicate replies  
✅ **No Manual Trigger:** Replies arrive automatically without calling `/api/jobs/run-outbound` manually

---

## Monitoring

### Key Metrics to Watch

1. **Webhook Latency:** Should be <300ms (p95)
2. **Job Queue Depth:** Should be <10 queued jobs
3. **Job Processing Time:** Should be <5s per job
4. **Outbound Success Rate:** Should be >95%
5. **Duplicate Rate:** Should be 0%

### Log Patterns to Monitor

```bash
# Webhook enqueue success
grep "✅ \[WEBHOOK\] Job enqueued" logs

# Job runner processing
grep "📦 \[JOB-RUNNER\] Processing" logs

# Outbound sent
grep "✅ \[JOB-RUNNER\] Outbound sent" logs

# Duplicate blocked
grep "⚠️.*Duplicate.*blocked" logs

# Errors
grep "❌" logs
```

---

**Last Updated:** 2025-01-30  
**Status:** ✅ Ready for Production

