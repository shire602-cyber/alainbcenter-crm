# Vercel + Neon Migration Timeout Fix

## Problem

Vercel builds fail with:
```
Error: P1002
The database server was reached but timed out.
Timed out trying to acquire a postgres advisory lock
```

This happens because Neon's connection pooling can cause advisory lock timeouts during Prisma migrations.

## Solution

A retry script (`scripts/migrate-with-retry.js`) has been added that:
1. Retries migrations up to 3 times with exponential backoff
2. Uses `DIRECT_URL` if available (bypasses connection pooling)
3. Checks migration status before deploying
4. Handles timeouts gracefully

## Required Vercel Environment Variables

**IMPORTANT:** Set both `DATABASE_URL` and `DIRECT_URL` in Vercel:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add/verify these variables:

```
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require
DIRECT_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require
```

**Key Difference:**
- `DATABASE_URL`: Uses `-pooler` (connection pooling) - for app runtime
- `DIRECT_URL`: No `-pooler` (direct connection) - for migrations

Get both URLs from Neon Dashboard → Connection Details.

## How It Works

1. **Build starts:** `npm run vercel-build` runs
2. **Migration script:** `scripts/migrate-with-retry.js` executes
3. **Status check:** Checks if migrations are already applied
4. **If pending:** Deploys migrations using `DIRECT_URL` (non-pooled)
5. **Retry logic:** If timeout occurs, retries up to 3 times
6. **Build continues:** Even if migrations timeout, build continues (migrations can be applied manually)

## Manual Migration (If Needed)

If migrations still fail during build, apply them manually:

```bash
# Option 1: Via Vercel CLI
vercel env pull .env.local
npx prisma migrate deploy

# Option 2: Via Neon Console
# Copy SQL from prisma/migrations/*.sql files
# Paste into Neon SQL Editor and execute
```

## Verification

After deployment, verify migrations:

```bash
# Check migration status
npx prisma migrate status

# Should show: "Database schema is up to date"
```

## Troubleshooting

### Still Getting Timeouts?

1. **Check DIRECT_URL is set** in Vercel environment variables
2. **Verify both URLs are correct** (pooler vs non-pooler)
3. **Check Neon dashboard** for connection limits
4. **Try manual migration** if build continues to fail

### Build Succeeds But Migrations Not Applied?

The script is designed to not fail the build if migrations timeout. Apply manually:

```bash
DATABASE_URL="your_prod_url" npx prisma migrate deploy
```

---

**Last Updated:** 2025-12-31

