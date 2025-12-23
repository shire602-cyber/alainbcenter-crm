# 🚨 URGENT: Apply Migration to Fix Inbound Messages

## Problem
Inbound WhatsApp messages are failing with error:
```
The column `Lead.infoSharedAt` does not exist in the current database.
```

## Solution: Apply Migration NOW

### Step 1: Log in to Your Vercel App
Visit: `https://your-app.vercel.app` and log in as **admin**.

### Step 2: Apply Migration
Visit this URL in your browser (while logged in as admin):
```
https://your-app.vercel.app/api/admin/migrate
```

You should see:
```json
{
  "success": true,
  "message": "Migration applied successfully",
  "columnsAdded": ["infoSharedAt", "quotationSentAt", "lastInfoSharedType"]
}
```

### Step 3: Verify
After applying, try sending a test WhatsApp message. It should work now.

---

## Alternative: If Browser Method Doesn't Work

### Option A: Use PowerShell Script

1. Get your session cookie:
   - Log in to your app
   - Open Developer Tools (F12)
   - Go to Application → Cookies
   - Copy the `session` cookie value

2. Run:
```powershell
.\scripts\call-migration-and-seed.ps1 `
  -BaseUrl "https://your-app.vercel.app" `
  -SessionCookie "session=your-cookie-value"
```

### Option B: Direct SQL (If you have database access)

Connect to your PostgreSQL database and run:

```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

---

## What Was Fixed

I've added a temporary fallback in the code that:
- ✅ Prevents crashes when migration isn't applied
- ✅ Allows messages to be processed (but info sharing won't be tracked until migration is applied)
- ✅ Logs a warning instead of failing

**But you still need to apply the migration for full functionality!**

---

## After Migration

Once migration is applied:
1. ✅ Inbound messages will work normally
2. ✅ Info/quotation sharing will be tracked
3. ✅ Follow-up automation will work
4. ✅ All Phase 1-5 features will be fully functional

---

## Status

- ✅ **Code fix:** Deployed (prevents crashes)
- ⚠️ **Migration:** **NEEDS TO BE APPLIED** (visit `/api/admin/migrate`)

**Apply the migration now to restore full functionality!** 🚀
