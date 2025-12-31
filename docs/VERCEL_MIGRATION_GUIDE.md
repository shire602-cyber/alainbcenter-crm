# Vercel Migration Guide

## Problem

Prisma migrations can cause Vercel builds to fail due to:
- Neon connection pooling timeouts
- Advisory lock timeouts
- Database connection issues during build

## Solution

**Migrations are now skipped during build** to ensure builds always succeed.

## How to Apply Migrations

### Option 1: Via Vercel CLI (Recommended)

```bash
# 1. Install Vercel CLI if not already installed
npm i -g vercel

# 2. Link to your project
vercel link

# 3. Pull environment variables
vercel env pull .env.local

# 4. Apply migrations
npx prisma migrate deploy
```

### Option 2: Via Neon Console

1. Go to Neon Dashboard → Your Project
2. Open SQL Editor
3. Copy SQL from migration files in `prisma/migrations/`
4. Execute in SQL Editor

### Option 3: Manual Connection

```bash
# Set DATABASE_URL to your production database
export DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Apply migrations
npx prisma migrate deploy
```

## When to Apply Migrations

- **After deploying new code** that includes schema changes
- **Before first deployment** to production
- **When you see "Table does not exist" errors** in production

## Verification

After applying migrations, verify:

```bash
npx prisma migrate status
```

Should show: `Database schema is up to date`

## Build Process

The build process now:
1. ✅ Generates Prisma Client (`prisma generate`)
2. ✅ Builds Next.js app (`next build`)
3. ⏭️ Skips migrations (apply separately)

This ensures builds always succeed, and migrations can be applied when the database is ready.

---

**Last Updated:** 2025-12-31

