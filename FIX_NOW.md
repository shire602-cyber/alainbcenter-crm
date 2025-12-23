# 🚨 FIX INBOUND MESSAGES NOW

## The Problem
Your database is missing the `infoSharedAt` column, causing all inbound messages to fail.

## ✅ SOLUTION: Run SQL Directly

### Step 1: Access Your Database

**Option A: Vercel Dashboard**
1. Go to Vercel Dashboard
2. Click on your project
3. Go to **Storage** tab
4. Click on your database
5. Click **"Query"** or **"Connect"**

**Option B: Database Provider Dashboard**
- If using Neon: Go to Neon Dashboard → SQL Editor
- If using Supabase: Go to Supabase Dashboard → SQL Editor
- If using Railway: Go to Railway Dashboard → Database → Connect

### Step 2: Run This SQL

**Copy and paste this SQL:**

```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

**Click "Run" or "Execute"**

### Step 3: Verify

After running, you should see:
- ✅ 3 rows returned (if you run the SELECT query)
- ✅ No errors

### Step 4: Test

Send a test WhatsApp message. It should work now!

---

## Alternative: Use Migration Endpoint

**After Vercel redeploys (wait 2-3 minutes), visit:**
```
https://your-app.vercel.app/api/admin/migrate
```

Or:
```
https://your-app.vercel.app/api/migrate
```

**No authentication needed** (emergency mode enabled).

---

## What This Does

Adds 3 columns to your `Lead` table:
- `infoSharedAt` - When info was shared
- `quotationSentAt` - When quotation was sent
- `lastInfoSharedType` - Type of info shared

---

## Status

- ✅ **Code fix:** Deployed (prevents crashes)
- ✅ **Migration endpoint:** Works without auth (after redeploy)
- ⚠️ **Migration:** **MUST BE APPLIED** (run SQL above)

**Run the SQL NOW to fix inbound messages immediately!** ⚡

---

## Quick Copy-Paste SQL

```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

**This is the fastest way to fix it!** 🚀
