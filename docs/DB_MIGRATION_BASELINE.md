# Database Migration Baseline Guide

## Overview

This guide explains how to set up a fresh Neon PostgreSQL database and apply migrations.

## Prerequisites

- Neon account and project created
- `DATABASE_URL` environment variable set
- `DIRECT_URL` environment variable set (for migrations)

## Setup Steps

### 1. Get Connection Strings from Neon

1. Go to [Neon Dashboard](https://console.neon.tech)
2. Select your project
3. Go to **Connection Details**
4. Copy:
   - **Pooled connection** → Use for `DATABASE_URL`
   - **Direct connection** → Use for `DIRECT_URL`

### 2. Set Environment Variables

```bash
# For local development
export DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require"
export DIRECT_URL="postgresql://USERNAME:PASSWORD@HOST.REGION.aws.neon.tech/DATABASE?sslmode=require"

# Or add to .env.local
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
```

### 3. Validate Schema

```bash
npx prisma validate
```

**Expected output:**
```
✔ The Prisma schema is valid
```

### 4. Generate Prisma Client

```bash
npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client (version X.X.X) to ./node_modules/@prisma/client in XXXms
```

### 5. Apply Migrations

#### Option A: Fresh Database (Recommended)

```bash
# This will apply all migrations in order
npx prisma migrate deploy
```

**Expected output:**
```
✔ Applied migration `20251209160534_init` in XXXms
✔ Applied migration `20251209162114_add_expiry_and_communication_log` in XXXms
...
✔ All migrations have been successfully applied.
```

#### Option B: Development Database (with shadow DB)

```bash
# This creates a shadow database for validation
npx prisma migrate dev
```

**Note:** If shadow database creation fails (P3006), you can:
1. Set `PRISMA_MIGRATE_SKIP_GENERATE=1` to skip shadow DB
2. Or use `prisma migrate deploy` instead

### 6. Seed ServiceType Records

After migrations, seed the ServiceType table:

```bash
npx prisma db seed
```

**Expected output:**
```
🌱 Seeding ServiceType records...
  ✓ MAINLAND_BUSINESS_SETUP already exists (ID: 1)
  ✓ Created FAMILY_VISA (ID: 2)
  ...
✅ ServiceType seeding completed!
```

### 7. Verify Setup

```bash
# Check migration status
npx prisma migrate status

# Expected: "Database schema is up to date"
```

## Troubleshooting

### P3006: Shadow Database Creation Failed

**Error:**
```
Error: P3006
Migration engine failed to create the shadow database.
```

**Solution:**
1. Use `prisma migrate deploy` instead of `prisma migrate dev`
2. Or set `PRISMA_MIGRATE_SKIP_GENERATE=1` environment variable
3. Or manually create a shadow database in Neon

### Migration Order Issues

If migrations are out of order or contain SQLite syntax:

1. **Backup existing migrations:**
   ```bash
   mv prisma/migrations prisma/migrations_legacy_$(date +%Y%m%d)
   ```

2. **Create fresh baseline:**
   ```bash
   npx prisma migrate dev --name init_postgresql
   ```

3. **This will:**
   - Create a new migration from current schema
   - Apply it to your database
   - Mark it as applied

### ServiceType Not Found

If `serviceTypeId` is null when `serviceTypeEnum` is set:

1. **Run seed:**
   ```bash
   npx prisma db seed
   ```

2. **Verify ServiceType exists:**
   ```sql
   SELECT id, code, name FROM "ServiceType" WHERE code = 'FAMILY_VISA';
   ```

3. **Update existing Leads:**
   ```sql
   UPDATE "Lead" 
   SET "serviceTypeId" = (
     SELECT id FROM "ServiceType" WHERE code = "Lead"."serviceTypeEnum"
   )
   WHERE "serviceTypeEnum" IS NOT NULL AND "serviceTypeId" IS NULL;
   ```

## Production Deployment

### Vercel Deployment

1. **Set environment variables in Vercel:**
   - `DATABASE_URL` (pooled connection)
   - `DIRECT_URL` (direct connection)

2. **Migrations run automatically:**
   - Vercel runs `prisma generate` during build
   - Run `npx prisma migrate deploy` manually after first deploy

3. **Seed after first migration:**
   ```bash
   # Via Vercel CLI or SSH
   npx prisma db seed
   ```

## Migration Best Practices

1. **Always test migrations locally first**
2. **Backup database before applying migrations**
3. **Use `migrate deploy` in production** (not `migrate dev`)
4. **Run seed after migrations** to ensure ServiceType records exist
5. **Verify with `prisma migrate status`** after deployment

## Verification Commands

```bash
# 1. Validate schema
npx prisma validate

# 2. Check migration status
npx prisma migrate status

# 3. Verify ServiceType seeding
npx prisma db seed

# 4. Test build
npm run build

# 5. Run verification scripts
npx tsx scripts/verify-threading.ts
npx tsx scripts/verify-idempotency.ts
```

## Expected Results

After successful setup:

- ✅ `npx prisma validate` → Schema is valid
- ✅ `npx prisma migrate status` → Database schema is up to date
- ✅ `npx prisma db seed` → ServiceType records created
- ✅ `npm run build` → Build succeeds
- ✅ All verification scripts pass

