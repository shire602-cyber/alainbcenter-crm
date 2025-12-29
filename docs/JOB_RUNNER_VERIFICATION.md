# Job Runner & Cron Verification Guide

## Overview

The WhatsApp job queue system requires:
1. **Job Runner** (`/api/jobs/run-outbound`) - Processes queued outbound jobs
2. **Cron Endpoint** (`/api/cron/run-outbound-jobs`) - Triggers job runner automatically
3. **Vercel Cron** (configured in `vercel.json`) - Calls cron endpoint every 30 seconds

## Current Status

### ✅ Configured
- Job runner endpoint: `/api/jobs/run-outbound`
- Cron endpoint: `/api/cron/run-outbound-jobs`
- Vercel cron configuration: Added to `vercel.json` (runs every 30 seconds)
- Vercel cron support: Endpoint accepts `x-vercel-cron` header

### ⚠️ Required Environment Variables
- `JOB_RUNNER_TOKEN` - Token for job runner authentication
- `CRON_SECRET` - Secret for cron endpoint authentication (optional if using Vercel cron)

## Verification Steps

### 1. Check Vercel Cron Configuration

**In Vercel Dashboard:**
1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to: **Settings** → **Cron Jobs**
4. Look for: `/api/cron/run-outbound-jobs` with schedule `*/30 * * * * *`

**In Code:**
```bash
cat vercel.json | grep -A 3 "run-outbound-jobs"
```

Should show:
```json
{
  "path": "/api/cron/run-outbound-jobs",
  "schedule": "*/30 * * * * *"
}
```

### 2. Test Job Runner Directly

```bash
# Replace YOUR_DOMAIN and YOUR_JOB_RUNNER_TOKEN
curl "https://YOUR_DOMAIN/api/jobs/run-outbound?token=YOUR_JOB_RUNNER_TOKEN&max=10"
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

### 3. Test Cron Endpoint

**With Bearer Token:**
```bash
curl -X GET "https://YOUR_DOMAIN/api/cron/run-outbound-jobs" \
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

### 4. Check Vercel Logs

**In Vercel Dashboard:**
1. Go to: **Deployments** → **Latest** → **Functions Logs**
2. Look for these log patterns:

**When Vercel Cron Runs:**
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

### 5. Check Database for Queued Jobs

```sql
-- Count queued jobs
SELECT COUNT(*) FROM "OutboundJob" WHERE status = 'queued';

-- Count running jobs
SELECT COUNT(*) FROM "OutboundJob" WHERE status = 'running';

-- Count completed jobs (last hour)
SELECT COUNT(*) FROM "OutboundJob" 
WHERE status = 'done' 
AND "completedAt" > NOW() - INTERVAL '1 hour';

-- Count failed jobs (last 24 hours)
SELECT COUNT(*) FROM "OutboundJob" 
WHERE status = 'failed' 
AND "completedAt" > NOW() - INTERVAL '24 hours';
```

**Expected Behavior:**
- Queued jobs should decrease over time (if jobs are being created)
- Running jobs should be 0 or very low (jobs process quickly)
- Completed jobs should increase as webhooks create jobs
- Failed jobs should be rare (only on persistent errors)

### 6. Automated Verification Script

Run the verification script:

```bash
# Set environment variables
export CRON_SECRET=your-secret
export JOB_RUNNER_TOKEN=your-token

# Run verification
./scripts/verify-job-runner.sh your-domain.com
```

## Troubleshooting

### Issue: Cron Not Running Automatically

**Symptoms:**
- No logs in Vercel showing cron execution
- Queued jobs not being processed

**Solutions:**
1. **Check vercel.json:**
   ```bash
   cat vercel.json | grep "run-outbound-jobs"
   ```
   If not found, add it (already done in code).

2. **Redeploy to Vercel:**
   - Push changes to trigger new deployment
   - Vercel cron only activates after deployment

3. **Check Vercel Dashboard:**
   - Settings → Cron Jobs
   - Should show `/api/cron/run-outbound-jobs`

### Issue: 401 Unauthorized

**Symptoms:**
- Cron endpoint returns 401
- Job runner returns 401

**Solutions:**
1. **For Vercel Cron:**
   - Should work automatically (x-vercel-cron header)
   - Check logs for "Vercel cron request detected"

2. **For Manual Calls:**
   - Set `CRON_SECRET` environment variable
   - Use: `Authorization: Bearer YOUR_CRON_SECRET`
   - Set `JOB_RUNNER_TOKEN` environment variable
   - Use: `?token=YOUR_JOB_RUNNER_TOKEN`

### Issue: Jobs Not Processing

**Symptoms:**
- Queued jobs count stays high
- No "Processing job" logs

**Solutions:**
1. **Check Job Runner Token:**
   ```bash
   curl "https://YOUR_DOMAIN/api/jobs/run-outbound?token=YOUR_TOKEN&max=10"
   ```
   Should return 200, not 401.

2. **Check Database Connection:**
   - Job runner uses Prisma with `FOR UPDATE SKIP LOCKED`
   - Ensure database is accessible from Vercel

3. **Check Logs:**
   - Look for errors in Vercel logs
   - Check for Prisma connection errors

## Monitoring

### Key Metrics to Watch

1. **Job Queue Size:**
   ```sql
   SELECT status, COUNT(*) FROM "OutboundJob" GROUP BY status;
   ```

2. **Processing Rate:**
   ```sql
   SELECT 
     DATE_TRUNC('minute', "completedAt") as minute,
     COUNT(*) as processed
   FROM "OutboundJob"
   WHERE status = 'done'
   AND "completedAt" > NOW() - INTERVAL '1 hour'
   GROUP BY minute
   ORDER BY minute DESC;
   ```

3. **Error Rate:**
   ```sql
   SELECT 
     DATE_TRUNC('hour', "completedAt") as hour,
     COUNT(*) as failed
   FROM "OutboundJob"
   WHERE status = 'failed'
   AND "completedAt" > NOW() - INTERVAL '24 hours'
   GROUP BY hour
   ORDER BY hour DESC;
   ```

## Expected Behavior

### Normal Operation

1. **Webhook receives message:**
   - Creates `OutboundJob` with `status='queued'`
   - Returns 200 immediately (<300ms)

2. **Vercel Cron runs (every 30 seconds):**
   - Calls `/api/cron/run-outbound-jobs`
   - Endpoint detects `x-vercel-cron` header
   - Calls `/api/jobs/run-outbound` internally

3. **Job Runner processes jobs:**
   - Picks queued jobs with `FOR UPDATE SKIP LOCKED`
   - Marks job `status='running'`
   - Runs orchestrator
   - Sends outbound message
   - Marks job `status='done'`

4. **Result:**
   - Customer receives WhatsApp reply
   - Job marked as done
   - No duplicate sends (idempotency)

### Failure Scenarios

1. **Cron Not Running:**
   - Jobs queue up but don't process
   - Solution: Check vercel.json, redeploy

2. **Job Runner Fails:**
   - Job marked `status='failed'` after max attempts
   - Solution: Check logs, fix underlying issue

3. **Orchestrator Timeout:**
   - Job retries with exponential backoff
   - Solution: Increase timeout or optimize orchestrator

## Summary

✅ **Automated Cron:** Configured in `vercel.json` (runs every 30 seconds)  
✅ **Vercel Cron Support:** Endpoint accepts `x-vercel-cron` header  
✅ **Job Runner:** Processes jobs with idempotency  
✅ **Monitoring:** Check Vercel logs and database for job status

**Next Steps:**
1. Deploy to Vercel (cron activates automatically)
2. Monitor Vercel logs for cron execution
3. Verify jobs are being processed
4. Check database for job status

