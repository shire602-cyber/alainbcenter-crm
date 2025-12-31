# Migration Deployment Guide

## Overview

Database migrations are **NOT** run automatically during Vercel builds to prevent timeout issues. Migrations should be run separately using one of the methods below.

## Why Migrations Don't Run During Build

- **Connection Timeouts**: Database connections during build can timeout, causing deployment failures
- **Advisory Lock Issues**: Prisma's advisory locks can conflict with concurrent builds
- **Build Speed**: Separating migrations from builds makes deployments faster and more reliable

## CRITICAL: Use DIRECT_URL for Migrations

**Neon Connection Pooling Issue**: Neon's pooled connections (`-pooler`) can cause advisory lock timeouts (P1002) during migrations.

**Solution**: Always use `DIRECT_URL` (non-pooled connection) for migrations.

### Setting DIRECT_URL in Vercel

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add `DIRECT_URL` with your Neon **non-pooled** connection string:
   ```
   DIRECT_URL=postgresql://USERNAME:PASSWORD@HOST.REGION.aws.neon.tech/DATABASE?sslmode=require
   ```
   **Note**: Remove `-pooler` from the hostname for DIRECT_URL
3. Keep `DATABASE_URL` as the pooled connection (for app runtime)

### Getting DIRECT_URL from Neon

1. Go to **Neon Dashboard** → Your Project
2. Click **Connection Details**
3. Copy the **Direct connection** string (NOT the pooled one)
4. Use this for `DIRECT_URL`

## How to Run Migrations

### Option 1: Manual Migration (Recommended for Production)

```bash
# The migration script automatically uses DIRECT_URL if available
npm run migrate:deploy
```

Or manually:
```bash
# Set DIRECT_URL if not already set
export DIRECT_URL="postgresql://..."

# Run migrations
npx prisma migrate deploy
```

### Option 2: Vercel Post-Deploy Hook

Create a Vercel deployment hook that runs migrations after successful deployment:

1. Go to Vercel Dashboard → Project Settings → Git
2. Add a Post-Deploy hook that calls:
   ```bash
   npm run migrate:deploy
   ```

### Option 3: Separate Migration Endpoint

Call the migration endpoint after deployment:
```bash
curl -X POST https://your-app.vercel.app/api/admin/migrate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Migration Script

The `migrate:deploy` script includes:
- Automatic retry logic (3 attempts)
- Exponential backoff for timeouts
- Automatic DIRECT_URL detection
- Clear error messages

**Features**:
- Uses `DIRECT_URL` if available (bypasses connection pooling)
- Falls back to `DATABASE_URL` if `DIRECT_URL` not set
- Warns if using pooled connection
- 2-minute timeout per attempt
- 30-second advisory lock timeout

## Troubleshooting

### Migration Timeout Errors (P1002)

**Symptom**: `Error: P1002 - The database server was reached but timed out`

**Causes**:
1. Using pooled connection for migrations
2. Another migration is running
3. Database connection limits reached

**Solutions**:
1. **Set DIRECT_URL** in Vercel environment variables (most important!)
2. Wait a few minutes and retry
3. Check Neon dashboard for connection limits
4. Ensure no other migrations are running

### Migration Lock Errors

**Symptom**: `Timed out trying to acquire a postgres advisory lock`

**Solutions**:
1. Use `DIRECT_URL` instead of pooled connection
2. Wait 30-60 seconds and retry
3. Check if another migration is running
4. Manually release locks if needed (contact database admin)

### Build Failures

**Symptom**: Build fails with webpack/CSS errors

**Solutions**:
1. Clear `.next` cache: `rm -rf .next`
2. Rebuild: `npm run build`
3. Check for CSS syntax errors in `src/app/globals.css`

## Best Practices

1. **Always set DIRECT_URL** in Vercel environment variables
2. **Test migrations locally first**: `npx prisma migrate dev`
3. **Run migrations during low-traffic periods**
4. **Monitor database connections** during migration
5. **Keep migrations small and fast** (avoid long-running migrations)
6. **Use `migrate deploy` in production** (not `migrate dev`)

## Emergency Rollback

If a migration causes issues:
1. Revert the migration file
2. Run: `npx prisma migrate resolve --rolled-back <migration_name>`
3. Or manually fix the database schema

## Environment Variables Checklist

**Required for Vercel**:
- ✅ `DATABASE_URL` - Pooled connection (for app runtime)
- ✅ `DIRECT_URL` - Non-pooled connection (for migrations) **CRITICAL**

**Optional**:
- `PRISMA_MIGRATE_LOCK_TIMEOUT` - Advisory lock timeout (default: 30000ms)
