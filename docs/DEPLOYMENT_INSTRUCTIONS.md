# Deployment Instructions

## Trigger Vercel Deployment

Vercel automatically deploys when you push to the connected branch (usually `master` or `main`).

### Step 1: Push to GitHub

```bash
git push origin master
```

### Step 2: Verify Deployment

1. Go to Vercel Dashboard → Your Project
2. Check "Deployments" tab
3. You should see a new deployment triggered by the push

### Step 3: If Deployment Doesn't Trigger

**Option A: Manual Deploy via Vercel Dashboard**
1. Vercel Dashboard → Your Project → Deployments
2. Click "Redeploy" on the latest deployment
3. Or click "Deploy" → "Deploy Git Commit" → Select latest commit

**Option B: Trigger via Vercel CLI**
```bash
# Install Vercel CLI if not installed
npm i -g vercel

# Deploy
vercel --prod
```

**Option C: Force Push (if needed)**
```bash
# Create an empty commit to trigger deployment
git commit --allow-empty -m "Trigger Vercel deployment"
git push origin master
```

---

## Run Migrations on Production

### Option 1: Via Script (Recommended)

```bash
DATABASE_URL="your-production-db-url" bash scripts/run-migrations.sh
```

This script:
1. Runs `npx prisma migrate deploy`
2. Verifies schema with `npx tsx scripts/db/verify-schema.ts`

### Option 2: Manual Commands

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://..."

# Run migrations
npx prisma migrate deploy

# Verify schema
npx tsx scripts/db/verify-schema.ts
```

### Option 3: Via Neon Dashboard SQL Editor

1. Go to Neon Dashboard → Your Project → SQL Editor
2. Copy SQL from: `prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql`
3. Paste and execute

---

## Required Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

**Database:**
- `DATABASE_URL` - PostgreSQL connection string (pooler)
- `DIRECT_URL` - PostgreSQL direct connection (for migrations)

**Cron & Jobs:**
- `CRON_SECRET` - Secret for cron endpoint auth
- `JOB_RUNNER_TOKEN` - Secret for job runner auth

**WhatsApp:**
- `WHATSAPP_ACCESS_TOKEN` - Meta Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` - Meta phone number ID
- `WHATSAPP_VERIFY_TOKEN` - Webhook verification token

---

## Post-Deployment Verification

1. **Check Vercel Logs:**
   - Vercel Dashboard → Your Project → Functions → Logs
   - Look for successful function invocations

2. **Test Cron Endpoint:**
   ```bash
   curl "https://your-domain.vercel.app/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET"
   ```

3. **Verify Migrations:**
   ```bash
   DATABASE_URL="your-production-db-url" npx tsx scripts/db/verify-schema.ts
   ```

4. **Send Test WhatsApp Message:**
   - Send message to business number
   - Verify reply arrives automatically

---

## Troubleshooting

### Deployment Not Triggering

**Check:**
- Git push was successful: `git log origin/master`
- Vercel project is connected to correct GitHub repo
- Branch name matches (master vs main)

**Fix:**
- Create empty commit: `git commit --allow-empty -m "Trigger deployment" && git push`
- Or manually redeploy in Vercel Dashboard

### Migrations Fail

**Check:**
- `DATABASE_URL` is correct
- Database user has `ALTER TABLE` permissions
- Connection is stable

**Fix:**
- Run SQL manually via Neon Dashboard
- Check migration file: `prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql`

### Cron Returns 401

**Check:**
- `CRON_SECRET` is set in Vercel Environment Variables
- Vercel cron sends `x-vercel-cron: 1` header

**Fix:**
- Verify `CRON_SECRET` in Vercel Dashboard
- Test manually with: `curl "https://your-domain.vercel.app/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET"`

---

**Last Updated:** 2025-01-30

