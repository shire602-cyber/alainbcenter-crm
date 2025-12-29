# Neon Database Setup Guide

**Your Neon Database Connection Details**

---

## Database Connection String

**⚠️ SECURITY WARNING:** Never commit real database credentials to Git. Use environment variables only.

Get your connection string from Neon Dashboard → Connection Details → Connection String.

```
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require
DIRECT_URL=postgresql://USERNAME:PASSWORD@HOST.REGION.aws.neon.tech/DATABASE?sslmode=require
```

---

## Step 1: Update Prisma Schema

✅ **Already Done!** The schema has been updated to use PostgreSQL.

---

## Step 2: Run Migrations on Neon Database

Before deploying, you need to run your Prisma migrations on the Neon database:

```bash
# Set the DATABASE_URL environment variable (replace with your actual connection string from Neon Dashboard)
$env:DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require"

# Generate Prisma client for PostgreSQL
npx prisma generate

# Run migrations on Neon database
npx prisma migrate deploy
```

**Or run all at once:**
```powershell
# Replace with your actual connection string from Neon Dashboard
$env:DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require"; npx prisma generate; npx prisma migrate deploy
```

---

## Step 3: Seed Initial Data

After migrations, seed your database:

```powershell
# Set DATABASE_URL (replace with your actual connection string from Neon Dashboard)
$env:DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require"

# Create admin user
npx tsx scripts/create-admin.ts

# Seed document requirements
npx tsx scripts/seed-document-requirements.ts

# Seed automation rules
npx tsx scripts/seed-automation-rules.ts
```

---

## Step 4: Apply Performance Indexes

The performance indexes SQL file needs to be run on PostgreSQL. You can:

**Option A: Via Neon Console**
1. Go to Neon Dashboard
2. Open SQL Editor
3. Copy contents of `prisma/migrations/add_performance_indexes.sql`
4. Adapt SQL syntax for PostgreSQL (if needed)
5. Execute

**Option B: Via psql**
```bash
# Replace with your actual connection string from Neon Dashboard
psql "postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require" < prisma/migrations/add_performance_indexes.sql
```

**Note:** The indexes SQL file is written for SQLite. You may need to adapt it for PostgreSQL syntax.

---

## Step 5: Add to Vercel Environment Variables

In Vercel Dashboard → Project Settings → Environment Variables:

```
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require
DIRECT_URL=postgresql://USERNAME:PASSWORD@HOST.REGION.aws.neon.tech/DATABASE?sslmode=require
NODE_ENV=production
AUTH_SECRET=<your-generated-secret>
```
**⚠️ Get actual connection strings from Neon Dashboard → Connection Details. Never commit real credentials.**

See `docs/VERCEL_ENV_VARIABLES.md` for complete list.

---

## Step 6: Update Vercel Build Settings

Vercel should auto-detect Next.js, but verify:

- **Build Command:** `npm run build`
- **Install Command:** `npm install`
- **Output Directory:** `.next`

**Important:** Add postinstall script to generate Prisma client:

Update `package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

---

## Verification

After deployment, verify:

1. ✅ Database connection works
2. ✅ Migrations applied
3. ✅ Admin user exists
4. ✅ Can log in
5. ✅ Data loads correctly

---

## Troubleshooting

### "Prisma Client not generated"
- Add `"postinstall": "prisma generate"` to `package.json` scripts
- Or add build command: `npm install && npx prisma generate && npm run build`

### "Table does not exist"
- Run migrations: `npx prisma migrate deploy`
- Check DATABASE_URL is correct

### "Connection timeout"
- Use the pooled connection string (with `-pooler` in hostname)
- Verify SSL is enabled (`sslmode=require`)

---

**Status:** Ready to deploy once migrations are run! 🚀


