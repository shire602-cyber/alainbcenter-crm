# Local PostgreSQL Setup for Development

## Current Status
- ✅ Schema is set to PostgreSQL
- ✅ Production uses PostgreSQL on Vercel
- ⚠️ Local `.env` still has SQLite connection string

## Option 1: Connect to Vercel PostgreSQL (Recommended for Testing)

### Step 1: Get Connection String from Vercel
1. Go to **Vercel Dashboard** → Your Project
2. Click **Storage** tab
3. Find your PostgreSQL database
4. Click on it
5. Copy the **Connection String** (looks like `postgresql://...`)

### Step 2: Update Local .env
```bash
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"
```

**Note:** Make sure to use the **pooler** connection string if available (for better connection handling).

### Step 3: Test Connection
```bash
npx prisma db pull  # Pull schema from database
npx prisma generate # Generate Prisma client
```

---

## Option 2: Use Local PostgreSQL Database

### Step 1: Install PostgreSQL (if not installed)

**macOS (using Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Or download from:** https://www.postgresql.org/download/

### Step 2: Create Local Database
```bash
# Create database
createdb alainbcenter_crm_dev

# Or using psql:
psql postgres
CREATE DATABASE alainbcenter_crm_dev;
\q
```

### Step 3: Update .env
```bash
DATABASE_URL="postgresql://localhost:5432/alainbcenter_crm_dev"
```

**Or with username:**
```bash
DATABASE_URL="postgresql://your_username@localhost:5432/alainbcenter_crm_dev"
```

### Step 4: Run Migrations
```bash
npx prisma migrate dev
npx prisma generate
```

### Step 5: Seed Data (if needed)
```bash
npx tsx scripts/create-admin.ts
```

---

## Option 3: Use Neon/Supabase Free Tier (Alternative)

If you don't want to install PostgreSQL locally:

1. **Neon** (https://neon.tech):
   - Sign up for free
   - Create a project
   - Copy connection string
   - Add to `.env`

2. **Supabase** (https://supabase.com):
   - Sign up for free
   - Create a project
   - Go to Settings → Database
   - Copy connection string
   - Add to `.env`

---

## Quick Test After Setup

```bash
# Test connection
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.\$connect().then(() => { console.log('✅ Connected'); p.\$disconnect(); }).catch(e => console.error('❌', e.message))"

# Test login
npm run dev
# Then visit http://localhost:3000 and try logging in
```

---

## Important Notes

- **Never commit** `.env` file to Git (it's already in `.gitignore`)
- Use **different databases** for development and production
- The schema is now PostgreSQL, so SQLite won't work without schema changes
- If you need to switch back to SQLite locally, you'd need to change the schema provider, which is not recommended

