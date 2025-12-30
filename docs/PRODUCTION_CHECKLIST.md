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

**CRITICAL:** Run migrations on production database before deploying:

```bash
# Option 1: Via Prisma (recommended)
DATABASE_URL="your-production-db-url" npx prisma migrate deploy

# Option 2: Via Neon Dashboard SQL Editor
# Run SQL from: prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql
```

**Verify migrations applied:**
```bash
# Option 1: Use verification script (recommended)
DATABASE_URL="your-production-db-url" npx tsx scripts/db/verify-schema.ts

# Expected output:
# ✅ Conversation.deletedAt: EXISTS
# ✅ Notification.snoozedUntil: EXISTS
# ✅ Conversation_deletedAt_idx: EXISTS
# ✅ Notification_snoozedUntil_idx: EXISTS
# ✅ Schema verification PASSED
```

**Or verify via SQL:**
```sql
-- Check deletedAt column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'Conversation' AND column_name = 'deletedAt';
-- Expected: 1 row

-- Check snoozedUntil column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'Notification' AND column_name = 'snoozedUntil';
-- Expected: 1 row
```

**If migrations fail:**
- Check `DATABASE_URL` is correct
- Ensure database user has `ALTER TABLE` permissions
- Run SQL manually via Neon Dashboard if needed

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

### Step 1: Verify Cron is Running on PRODUCTION

**IMPORTANT:** Cron jobs only run on PRODUCTION deployments, not preview deployments.

**How to confirm you're on PRODUCTION:**
1. Vercel Dashboard → Your Project → Deployments
2. Find the deployment with "Production" badge (green)
3. Click on it → Check "Cron Jobs" tab
4. Verify `/api/cron/run-outbound-jobs` is listed and "Enabled"

**Command to test manually:**
```bash
# Test cron endpoint
curl "https://your-domain.vercel.app/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET"

# Test job runner directly
curl "https://your-domain.vercel.app/api/jobs/run-outbound?token=YOUR_JOB_RUNNER_TOKEN&max=1"
```

**Expected response (cron):**
```json
{
  "ok": true,
  "message": "Job runner triggered",
  "jobRunnerResult": {
    "ok": true,
    "processed": 0,
    "failed": 0
  },
  "requestId": "cron_1234567890_abc123",
  "authMethod": "query",
  "elapsed": "1234ms"
}
```

**Expected response (job runner):**
```json
{
  "ok": true,
  "processed": 0,
  "failed": 0,
  "jobIds": {
    "processed": [],
    "failed": []
  }
}
```

**Error responses (cron):**
- `{ "ok": false, "code": "MISSING_ENV", "error": "JOB_RUNNER_TOKEN missing in environment" }` - Set `JOB_RUNNER_TOKEN` in Vercel env vars
- `{ "ok": false, "code": "DOWNSTREAM_NOT_JSON", "statusCode": 500, "bodyPreview": "<html>..." }` - Job runner returned HTML error page
- `{ "ok": false, "code": "DOWNSTREAM_ERROR", "statusCode": 401, "bodyPreview": "..." }` - Job runner returned error status

**Error responses (job runner):**
- `{ "ok": false, "error": "Unauthorized" }` - Invalid or missing token

1. **Check Vercel Cron Logs (PRODUCTION only):**
   - Vercel Dashboard → Your Project → Deployments → [Production Deployment] → Functions → `/api/cron/run-outbound-jobs` → Logs
   - **OR:** Vercel Dashboard → Your Project → Cron Jobs → `/api/cron/run-outbound-jobs` → View Logs
   - **Expected log lines:**
     ```
     [CRON] start requestId=cron_1234567890_abc123
     [CRON] authorized method=vercel requestId=cron_1234567890_abc123 vercelHeaderValue="1"
     [CRON] calling job runner requestId=cron_1234567890_abc123 authMethod=vercel
     [CRON] job runner response requestId=cron_1234567890_abc123 statusCode=200 elapsed=1234ms ok=true processed=0 failed=0
     ```
   - **If you see 401:** Check `CRON_SECRET` is set in Vercel Environment Variables
   - **If you see MISSING_ENV:** Check `JOB_RUNNER_TOKEN` is set in Vercel Environment Variables
   - **If you see DOWNSTREAM_NOT_JSON:** Job runner returned HTML error page (check job runner logs)
   - **If you see DOWNSTREAM_ERROR:** Job runner returned error status (check statusCode and bodyPreview)
   - **If no logs:** Cron only runs on PRODUCTION, not preview deployments

2. **Manual Test (if needed):**
   ```bash
   curl "https://your-domain.vercel.app/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET"
   ```
   **Expected response:**
   ```json
   {
     "ok": true,
     "message": "Job runner triggered",
     "jobRunnerResult": {
       "ok": true,
       "processed": 1,
       "failed": 0
     },
     "requestId": "cron_1234567890_abc123",
     "authMethod": "query",
     "elapsed": "1234ms"
   }
   ```

### Step 2: Verify Webhook Enqueues Jobs

**Command to test manually (if you have webhook URL):**
```bash
# This is typically called by Meta, but you can test with curl if needed
curl -X POST "https://your-domain.vercel.app/api/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"260777711059","id":"test123","text":{"body":"Hello"}}]}}]}]}'
```

1. **Send a WhatsApp message** to your business number

2. **Check Vercel Function Logs:**
   - Vercel Dashboard → Your Project → Functions → `/api/webhooks/whatsapp` → Logs
   - **Expected log lines:**
     ```
     [WEBHOOK] INBOUND-ENTRY requestId=webhook_1234567890_abc123
     ✅ [WEBHOOK] Job enqueued requestId=webhook_1234567890_abc123 jobId=123 wasDuplicate=false elapsed=45ms
     🚀 [WEBHOOK] Kicked job runner requestId=webhook_1234567890_abc123 inboundMessageId=wamid.xxx
     ```
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

**Command to test manually:**
```bash
curl "https://your-domain.vercel.app/api/jobs/run-outbound?token=YOUR_JOB_RUNNER_TOKEN&max=10"
```

**Expected response:**
```json
{
  "ok": true,
  "processed": 1,
  "failed": 0,
  "jobIds": {
    "processed": [123],
    "failed": []
  }
}
```

1. **Wait 1-2 minutes** (cron runs every minute)

2. **Check Vercel Function Logs (PRODUCTION deployment):**
   - Vercel Dashboard → Your Project → Deployments → [Production Deployment] → Functions → `/api/jobs/run-outbound` → Logs
   - **Expected log lines (in order):**
     ```
     📦 [JOB-RUNNER] Processing 1 job(s)
     ✅ [JOB-RUNNER] picked jobId=123 requestId=job_123_1234567890 conversationId=456 inboundProviderMessageId=wamid.xxx
     📥 [JOB-RUNNER] Loading conversation jobId=123 requestId=job_123_1234567890 conversationId=456
     ✅ [JOB-RUNNER] Conversation loaded jobId=123 requestId=job_123_1234567890 conversationId=456 contactId=789 leadId=101
     📥 [JOB-RUNNER] Loading inbound message jobId=123 requestId=job_123_1234567890 inboundMessageId=202
     ✅ [JOB-RUNNER] Inbound message loaded jobId=123 requestId=job_123_1234567890 messageId=202 bodyLength=25
     🎯 [JOB-RUNNER] orchestrator start jobId=123 requestId=job_123_1234567890 conversationId=456 inboundMessageId=202
     ✅ [JOB-RUNNER] orchestrator end jobId=123 requestId=job_123_1234567890 elapsed=1234ms replyLength=150 hasHandover=false
     📤 [JOB-RUNNER] send start jobId=123 requestId=job_123_1234567890 conversationId=456 phone=+260777711059 inboundProviderMessageId=wamid.xxx
     ✅ [JOB-RUNNER] send end jobId=123 requestId=job_123_1234567890 messageId=wamid.yyy conversationId=456 phone=+260777711059 inboundProviderMessageId=wamid.xxx success=true elapsed=567ms
     🔍 [JOB-RUNNER] Message row check start jobId=123 requestId=job_123_1234567890 providerMessageId=wamid.yyy
     ✅ [JOB-RUNNER] Message row confirmed jobId=123 requestId=job_123_1234567890 messageRowId=303 status=SENT
     💾 [JOB-RUNNER] Marking job DONE jobId=123 requestId=job_123_1234567890 success=true
     ✅ [JOB-RUNNER] job done jobId=123 requestId=job_123_1234567890 status=done
     ```

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

