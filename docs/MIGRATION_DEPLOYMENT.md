# Migration Deployment Guide

## Overview

Database migrations are **NOT** run automatically during Vercel builds to prevent timeout issues. Migrations should be run separately using one of the methods below.

## Why Migrations Don't Run During Build

- **Connection Timeouts**: Database connections during build can timeout, causing deployment failures
- **Advisory Lock Issues**: Prisma's advisory locks can conflict with concurrent builds
- **Build Speed**: Separating migrations from builds makes deployments faster and more reliable

## How to Run Migrations

### Option 1: Manual Migration (Recommended for Production)

```bash
# Run migrations manually after deployment
npx prisma migrate deploy
```

Or use the retry script:
```bash
npm run migrate:deploy
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
- Clear error messages

## Troubleshooting

### Migration Timeout Errors

If you see `P1002` timeout errors:
1. Check database connection pool settings
2. Ensure DATABASE_URL is correct in Vercel environment variables
3. Try running migrations manually: `npx prisma migrate deploy`
4. Check Neon dashboard for connection limits

### Migration Lock Errors

If you see advisory lock errors:
1. Wait a few minutes and retry
2. Check if another migration is running
3. Manually release locks if needed (contact database admin)

## Best Practices

1. **Test migrations locally first**: `npx prisma migrate dev`
2. **Run migrations during low-traffic periods**
3. **Monitor database connections** during migration
4. **Keep migrations small and fast** (avoid long-running migrations)
5. **Use `migrate deploy` in production** (not `migrate dev`)

## Emergency Rollback

If a migration causes issues:
1. Revert the migration file
2. Run: `npx prisma migrate resolve --rolled-back <migration_name>`
3. Or manually fix the database schema

