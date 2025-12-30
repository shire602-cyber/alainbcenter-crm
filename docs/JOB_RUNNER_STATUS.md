# Job Runner & Cron Status Check

## Current Status (as of latest check)

### ❌ Issues Found

1. **Cron Job Missing from vercel.json**
   - The `/api/cron/run-outbound-jobs` cron was removed from `vercel.json`
   - This means jobs are NOT being processed automatically
   - **FIXED**: Added back to vercel.json with schedule `*/30 * * * * *`

2. **Cron Endpoint Authentication**
   - Endpoint only accepted Bearer token
   - Vercel cron sends `x-vercel-cron` header, not Bearer token
   - **FIXED**: Endpoint now accepts both `x-vercel-cron` header AND Bearer token

3. **Vercel Deployment Protection**
   - Deployment has authentication protection enabled
   - Cannot test endpoints directly without bypass token
   - This is normal for Vercel preview deployments

### ✅ What's Working

1. **Job Runner Endpoint**: `/api/jobs/run-outbound?token=...`
   - Exists and should work when called with correct token
   - Uses `FOR UPDATE SKIP LOCKED` for safe concurrent processing

2. **Cron Endpoint**: `/api/cron/run-outbound-jobs`
   - Exists and should work when called by Vercel cron
   - Now accepts both Vercel cron header and Bearer token

3. **Database Schema**: `OutboundJob` table exists
   - Migration should be applied in production

## Verification Steps

### 1. Check Vercel Cron Configuration

After deploying the fix, check in Vercel Dashboard:
1. Go to: **Settings** → **Cron Jobs**
2. Look for: `/api/cron/run-outbound-jobs` with schedule `*/30 * * * * *`
3. Status should be: **Active**

### 2. Check Vercel Logs

After deployment, monitor logs for:
```
✅ [CRON] Vercel cron request detected for outbound jobs
📦 [JOB-RUNNER] Processing X job(s)
🔄 [JOB-RUNNER] Processing job X (requestId: ...)
```

### 3. Check Database for Queued Jobs

```sql
-- Count queued jobs
SELECT COUNT(*) FROM "OutboundJob" WHERE status = 'queued';

-- Count completed jobs (last hour)
SELECT COUNT(*) FROM "OutboundJob" 
WHERE status = 'done' 
AND "completedAt" > NOW() - INTERVAL '1 hour';

-- Recent job activity
SELECT status, COUNT(*), MAX("createdAt") as latest
FROM "OutboundJob"
GROUP BY status
ORDER BY latest DESC;
```

**Expected Behavior:**
- Queued jobs should decrease over time (if jobs are being created)
- Completed jobs should increase as webhooks create jobs
- Running jobs should be 0 or very low (jobs process quickly)

### 4. Manual Test (if you have tokens)

```bash
# Test job runner directly
curl "https://your-domain.com/api/jobs/run-outbound?token=YOUR_JOB_RUNNER_TOKEN&max=10"

# Test cron endpoint with Bearer token
curl -X GET "https://your-domain.com/api/cron/run-outbound-jobs" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Next Steps

1. **Deploy the fix** (already committed and pushed)
2. **Wait for Vercel to redeploy** (automatic on push)
3. **Check Vercel Dashboard** → Settings → Cron Jobs (should show the cron)
4. **Monitor logs** for cron execution
5. **Check database** for job processing activity

## Troubleshooting

### If cron still doesn't run:

1. **Check vercel.json is deployed:**
   - Vercel reads vercel.json from the deployed branch
   - Ensure latest commit is deployed

2. **Check Vercel Cron Jobs page:**
   - Settings → Cron Jobs
   - Should show `/api/cron/run-outbound-jobs`
   - If missing, Vercel may need a redeploy

3. **Check environment variables:**
   - `JOB_RUNNER_TOKEN` should be set
   - `CRON_SECRET` should be set (optional if using Vercel cron)

4. **Check logs for errors:**
   - Look for 401 Unauthorized errors
   - Look for database connection errors
   - Look for Prisma errors

### If jobs queue up but don't process:

1. **Check job runner token:**
   - Ensure `JOB_RUNNER_TOKEN` is set correctly
   - Token in cron endpoint must match

2. **Check database connection:**
   - Job runner uses Prisma with `FOR UPDATE SKIP LOCKED`
   - Ensure database is accessible from Vercel

3. **Check for errors in logs:**
   - Look for orchestrator errors
   - Look for WhatsApp send errors
   - Look for Prisma transaction errors

## Summary

**Before Fix:**
- ❌ Cron not configured in vercel.json
- ❌ Endpoint didn't accept Vercel cron header
- ❌ Jobs not processing automatically

**After Fix:**
- ✅ Cron added to vercel.json (runs every 30 seconds)
- ✅ Endpoint accepts both Vercel cron header and Bearer token
- ✅ Jobs should process automatically after deployment

**Action Required:**
- Wait for Vercel to redeploy
- Verify cron appears in Vercel Dashboard
- Monitor logs for cron execution


