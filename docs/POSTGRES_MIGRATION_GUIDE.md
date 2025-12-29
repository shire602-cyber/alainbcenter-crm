# PostgreSQL Migration Guide

**Important:** Your existing migrations were created for SQLite. We need to create a fresh migration history for PostgreSQL.

---

## Option 1: Fresh Start (Recommended for Production)

This creates a new migration history for PostgreSQL:

```powershell
# Set Neon database URL (replace with your actual connection string from Neon Dashboard)
$env:DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require"

# Generate Prisma client for PostgreSQL
npx prisma generate

# Create initial migration for PostgreSQL
npx prisma migrate dev --name init_postgresql

# This will:
# 1. Create all tables in Neon database
# 2. Create a new migration file
# 3. Mark it as applied
```

**After this, your Neon database will have all tables!**

---

## Option 2: Manual Schema Push (Quick but not tracked)

If you just want to sync the schema without migration history:

```powershell
# Replace with your actual connection string from Neon Dashboard
$env:DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require"

# Generate Prisma client
npx prisma generate

# Push schema directly (creates tables, no migration history)
npx prisma db push
```

**Note:** This doesn't create migration files, but it's faster for initial setup.

---

## After Schema Setup

### 1. Seed Initial Data

```powershell
# Replace with your actual connection string from Neon Dashboard
$env:DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require"

# Create admin user
npx tsx scripts/create-admin.ts

# Seed document requirements
npx tsx scripts/seed-document-requirements.ts

# Seed automation rules
npx tsx scripts/seed-automation-rules.ts
```

### 2. Add Performance Indexes

Run the PostgreSQL indexes file:

```powershell
# Option A: Via psql (if installed) - Replace with your actual connection string from Neon Dashboard
psql "postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require" -f prisma/migrations/add_performance_indexes_postgres.sql

# Option B: Copy SQL to Neon Console SQL Editor
# 1. Open Neon Dashboard
# 2. Go to SQL Editor
# 3. Copy contents of prisma/migrations/add_performance_indexes_postgres.sql
# 4. Paste and execute
```

---

## For Vercel Deployment

After running migrations locally, Vercel will use `prisma migrate deploy` during build.

**Make sure:**
1. ✅ Schema is set to `postgresql`
2. ✅ `package.json` has `"postinstall": "prisma generate"`
3. ✅ `DATABASE_URL` is set in Vercel environment variables
4. ✅ Migrations are committed to Git (if using Option 1)

---

## Troubleshooting

### "Migration lock file mismatch"
- Delete `prisma/migrations/migration_lock.toml`
- Run `npx prisma migrate dev --name init_postgresql` again

### "EPERM: operation not permitted"
- Close any apps using Prisma (dev server, Prisma Studio)
- Try again

### "Table already exists"
- Use `npx prisma db push --force-reset` (⚠️ deletes all data)
- Or manually drop tables in Neon console

---

**Recommended:** Use Option 1 for proper migration tracking! 🚀


