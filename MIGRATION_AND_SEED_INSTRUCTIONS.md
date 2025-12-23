# 🚀 Apply Migration and Seed Rules - Instructions

## Quick Start

After your Vercel deployment is live, you need to:

1. **Apply the database migration** (adds 3 new columns)
2. **Seed the automation rules** (creates 6 automation rules)

---

## Method 1: Via Browser (Easiest)

### Step 1: Log in to your Vercel app
Visit: `https://your-app.vercel.app` and log in as admin.

### Step 2: Apply Migration
Visit: `https://your-app.vercel.app/api/admin/migrate`

You should see: `{"success":true,"message":"Migration applied successfully"}`

### Step 3: Seed Info Follow-up Rules
Visit: `https://your-app.vercel.app/api/admin/automation/seed-info-followup`

You should see: `{"ok":true,"message":"Info/quotation follow-up automation rules seeded successfully"}`

### Step 4: Seed Escalation Rules
Visit: `https://your-app.vercel.app/api/admin/automation/seed-escalation`

You should see: `{"ok":true,"message":"Escalation automation rules seeded successfully"}`

---

## Method 2: Via PowerShell Script

### Step 1: Get Your Session Cookie

1. Log in to your Vercel app in a browser
2. Open Developer Tools (F12)
3. Go to Application/Storage → Cookies
4. Copy the `session` cookie value

### Step 2: Run the Script

```powershell
.\scripts\call-migration-and-seed.ps1 `
  -BaseUrl "https://your-app.vercel.app" `
  -SessionCookie "session=your-session-cookie-value"
```

---

## Method 3: Via curl (Linux/Mac)

### Step 1: Get Your Session Cookie

Same as Method 2, Step 1.

### Step 2: Run the Script

```bash
chmod +x scripts/call-migration-and-seed.sh
./scripts/call-migration-and-seed.sh \
  "https://your-app.vercel.app" \
  "session=your-session-cookie-value"
```

---

## Method 4: Manual SQL (If API doesn't work)

If you have direct database access:

### Step 1: Apply Migration

Connect to your PostgreSQL database and run:

```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

### Step 2: Seed Rules

Then use Method 1 (browser) or Method 2/3 (scripts) to seed the rules.

---

## Verification

After applying, verify:

### Check Migration

```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'Lead' 
AND column_name IN ('infoSharedAt', 'quotationSentAt', 'lastInfoSharedType');
```

Should return 3 rows.

### Check Rules

Visit: `https://your-app.vercel.app/automation`

You should see 6 new automation rules:
- Follow-up After Info Shared – 2 Days
- Follow-up After Quotation Sent – 3 Days
- Follow-up After Document Shared – 1 Day
- Escalate: No Reply SLA Breach
- Escalate: Overdue Follow-up
- Escalate: Stale Lead

---

## What Gets Created

### Migration
- ✅ `infoSharedAt` column (TIMESTAMP)
- ✅ `quotationSentAt` column (TIMESTAMP)
- ✅ `lastInfoSharedType` column (TEXT)
- ✅ Index on `infoSharedAt`

### Rules (6 total)
- ✅ 3 Info/Quotation follow-up rules
- ✅ 3 Escalation rules

---

## Troubleshooting

### "Unauthorized" Error
- Make sure you're logged in as admin
- Check that your session cookie is valid
- Try logging out and back in

### "Permission denied" Error (Migration)
- The database user might not have ALTER TABLE permissions
- Use Method 4 (Manual SQL) with a database admin account

### "Rule already exists" Message
- This is OK! It means the rules are already seeded
- The system handles duplicates gracefully

### "Column already exists" Message
- This is OK! It means the migration is already applied
- The system handles duplicates gracefully

---

## Status

After completing all steps:

✅ **Migration:** Applied  
✅ **Rules:** Seeded  
✅ **System:** Ready to use  

**Everything should now work!** 🎉

---

## Need Help?

See `docs/APPLY_MIGRATION_AND_SEED.md` for more detailed instructions.
