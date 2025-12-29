# Deployment Verification Guide

## After Deployment

Once Vercel finishes deploying, verify the job runner and cron are working:

### 1. Check Vercel Cron Configuration

**In Vercel Dashboard:**
1. Go to: https://vercel.com/dashboard
2. Select your project: `alainbcenter-crm`
3. Go to: **Settings** → **Cron Jobs**
4. Look for: `/api/cron/run-outbound-jobs`
5. Schedule should be: `*/30 * * * * *` (every 30 seconds)
6. Status should be: **Active**

### 2. Check Vercel Logs

**In Vercel Dashboard:**
1. Go to: **Deployments** → **Latest** → **Functions Logs**
2. Wait 30-60 seconds after deployment
3. Look for these log patterns:

**When Vercel Cron Runs (every 30 seconds):**
```
✅ [CRON] Vercel cron request detected for outbound jobs
📦 [JOB-RUNNER] Processing X job(s)
```

**When Job Runner Processes Jobs:**
```
🔄 [JOB-RUNNER] Processing job X (requestId: ...)
📤 [JOB-RUNNER] Sending outbound for job X
✅ [JOB-RUNNER] Job X completed successfully
```

**If No Jobs to Process:**
```
📦 [JOB-RUNNER] Processing 0 job(s)
{"ok": true, "processed": 0, "failed": 0}
```

### 3. Test Endpoints (if you have tokens)

**Test Job Runner:**
```bash
curl "https://alainbcenter-g1iev2ghf-abdurahmans-projects-66129df5.vercel.app/api/jobs/run-outbound?token=YOUR_JOB_RUNNER_TOKEN&max=10"
```

**Expected Response:**
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

**Test Cron Endpoint (with Bearer token):**
```bash
curl -X GET "https://alainbcenter-g1iev2ghf-abdurahmans-projects-66129df5.vercel.app/api/cron/run-outbound-jobs" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Job runner triggered",
  "jobRunnerResult": {
    "ok": true,
    "processed": 0,
    "failed": 0
  }
}
```

### 4. Check Database for Job Activity

**Query queued jobs:**
```sql
SELECT COUNT(*) as queued FROM "OutboundJob" WHERE status = 'queued';
```

**Query completed jobs (last hour):**
```sql
SELECT COUNT(*) as completed FROM "OutboundJob" 
WHERE status = 'done' 
AND "completedAt" > NOW() - INTERVAL '1 hour';
```

**Query all job statuses:**
```sql
SELECT status, COUNT(*) as count, MAX("createdAt") as latest
FROM "OutboundJob"
GROUP BY status
ORDER BY latest DESC;
```

**Expected Behavior:**
- If webhooks are creating jobs: `queued` count should decrease over time
- `completed` count should increase as jobs are processed
- `running` should be 0 or very low (jobs process quickly)
- `failed` should be rare (only on persistent errors)

### 5. Test with Real Webhook

**Send a test WhatsApp message:**
1. Send a message to your WhatsApp business number
2. Check Vercel logs for:
   ```
   ✅ [WEBHOOK] Job enqueued requestId=... jobId=... elapsed=...ms
   ```
3. Wait 30-60 seconds
4. Check logs for:
   ```
   ✅ [CRON] Vercel cron request detected
   📦 [JOB-RUNNER] Processing 1 job(s)
   🔄 [JOB-RUNNER] Processing job X
   📤 [JOB-RUNNER] Sending outbound for job X
   ✅ [JOB-RUNNER] Job X completed successfully
   ```
5. You should receive a WhatsApp reply

## Troubleshooting

### Cron Not Running

**Symptoms:**
- No logs showing "Vercel cron request detected"
- Queued jobs not processing

**Solutions:**
1. **Check vercel.json is deployed:**
   - Verify latest commit includes cron configuration
   - Vercel reads vercel.json from deployed branch

2. **Check Vercel Cron Jobs page:**
   - Settings → Cron Jobs
   - Should show `/api/cron/run-outbound-jobs`
   - If missing, Vercel may need a few minutes to register it

3. **Redeploy if needed:**
   - Push an empty commit to trigger redeploy
   - Or manually trigger deployment in Vercel Dashboard

### Jobs Queue Up But Don't Process

**Symptoms:**
- Queued jobs count stays high
- No "Processing job" logs

**Solutions:**
1. **Check job runner token:**
   - Ensure `JOB_RUNNER_TOKEN` is set in Vercel environment variables
   - Token in cron endpoint must match

2. **Check database connection:**
   - Job runner uses Prisma with `FOR UPDATE SKIP LOCKED`
   - Ensure `DATABASE_URL` is set correctly

3. **Check for errors in logs:**
   - Look for Prisma connection errors
   - Look for orchestrator errors
   - Look for WhatsApp send errors

### 401 Unauthorized

**Symptoms:**
- Cron endpoint returns 401
- Job runner returns 401

**Solutions:**
1. **For Vercel Cron:**
   - Should work automatically (x-vercel-cron header)
   - Check logs for "Vercel cron request detected"
   - If not appearing, cron may not be registered yet

2. **For Manual Calls:**
   - Set `CRON_SECRET` in Vercel environment variables
   - Use: `Authorization: Bearer YOUR_CRON_SECRET`
   - Set `JOB_RUNNER_TOKEN` in Vercel environment variables
   - Use: `?token=YOUR_JOB_RUNNER_TOKEN`

## Success Indicators

✅ **Cron is working if:**
- Logs show "Vercel cron request detected" every 30 seconds
- Queued jobs decrease over time
- Completed jobs increase over time
- No errors in logs

✅ **Job runner is working if:**
- Jobs are being processed (status changes from 'queued' to 'done')
- Outbound messages are being sent
- No duplicate sends (idempotency working)

✅ **End-to-end is working if:**
- Send WhatsApp message → Job enqueued → Job processed → Reply sent
- All within 30-60 seconds

## Quick Verification Checklist

- [ ] Vercel cron appears in Settings → Cron Jobs
- [ ] Logs show "Vercel cron request detected" every 30 seconds
- [ ] Job runner endpoint returns 200 (with correct token)
- [ ] Cron endpoint returns 200 (with correct token or Vercel cron)
- [ ] Queued jobs are being processed
- [ ] No errors in logs
- [ ] Test webhook creates job and gets processed

