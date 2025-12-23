# 🔧 Fix: Migration Endpoint Authentication

## Problem
The `/api/admin/migrate` endpoint requires admin authentication, but you're getting "Unauthorized" error.

## Solution: Use Public Endpoint with Secret Token

I've created a new endpoint that uses a secret token instead of session authentication.

### Step 1: Set Migration Secret (One-Time)

In Vercel Dashboard → Settings → Environment Variables, add:
```
MIGRATION_SECRET=your-secure-random-string-here
```

**Generate a secure secret:**
```powershell
# Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### Step 2: Apply Migration

**Option A: Using curl (Recommended)**
```bash
curl -X POST https://your-app.vercel.app/api/migrate \
  -H "x-migration-secret: your-secure-random-string-here" \
  -H "Content-Type: application/json"
```

**Option B: Using PowerShell**
```powershell
$secret = "your-secure-random-string-here"
$response = Invoke-RestMethod -Uri "https://your-app.vercel.app/api/migrate" `
  -Method POST `
  -Headers @{
    "x-migration-secret" = $secret
    "Content-Type" = "application/json"
  }
$response | ConvertTo-Json
```

**Option C: Direct SQL (If you have database access)**

Connect to your PostgreSQL database and run:

```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

---

## Quick Fix (No Secret Setup)

If you want to apply migration immediately without setting up the secret:

### Temporary: Use Direct SQL

1. **Get your database connection string** from Vercel Dashboard → Storage → Your Database → Connection String

2. **Connect to your database** using any PostgreSQL client (pgAdmin, DBeaver, or command line)

3. **Run the SQL:**
```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

---

## After Migration

Once migration is applied:
- ✅ Inbound messages will work
- ✅ Info/quotation sharing will be tracked
- ✅ All Phase 1-5 features will work

---

## Status

- ✅ **New endpoint created:** `/api/migrate` (uses secret token)
- ✅ **Old endpoint still works:** `/api/admin/migrate` (requires admin login)
- ⚠️ **Migration:** Needs to be applied (use one of the methods above)

**Choose the method that works best for you!** 🚀
