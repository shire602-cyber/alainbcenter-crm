# Apply Migration and Seed Rules

## Quick Methods

### Method 1: Via API Endpoints (Recommended for Vercel)

After deployment, visit these URLs as admin:

1. **Apply Migration:**
   ```
   POST https://your-app.vercel.app/api/admin/migrate
   ```

2. **Seed Info Follow-up Rules:**
   ```
   POST https://your-app.vercel.app/api/admin/automation/seed-info-followup
   ```

3. **Seed Escalation Rules:**
   ```
   POST https://your-app.vercel.app/api/admin/automation/seed-escalation
   ```

**Using curl:**
```bash
# Get your session cookie first by logging in, then:
curl -X POST https://your-app.vercel.app/api/admin/migrate \
  -H "Cookie: session=your-session-cookie"

curl -X POST https://your-app.vercel.app/api/admin/automation/seed-info-followup \
  -H "Cookie: session=your-session-cookie"

curl -X POST https://your-app.vercel.app/api/admin/automation/seed-escalation \
  -H "Cookie: session=your-session-cookie"
```

---

### Method 2: Via Script (Local/Server)

Run the automated script:

```bash
# Set your production DATABASE_URL
export DATABASE_URL="postgresql://user:pass@host:port/db?sslmode=require"

# Run the script
npx tsx scripts/apply-migration-and-seed.ts
```

---

### Method 3: Manual SQL (Direct Database Access)

If you have direct database access:

**1. Apply Migration:**
```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

**2. Seed Rules:**

Then visit the seed endpoints via browser or API.

---

## Verification

After applying, verify:

1. **Check Migration:**
   ```sql
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'Lead' 
   AND column_name IN ('infoSharedAt', 'quotationSentAt', 'lastInfoSharedType');
   ```
   Should return 3 rows.

2. **Check Rules:**
   ```sql
   SELECT name, trigger, enabled 
   FROM "AutomationRule" 
   WHERE trigger IN ('INFO_SHARED', 'NO_REPLY_SLA', 'FOLLOWUP_OVERDUE', 'NO_ACTIVITY');
   ```
   Should return at least 6 rules.

---

## Troubleshooting

### "Permission denied" Error

If you get permission errors:
- Use Method 3 (Manual SQL) with database admin access
- Or use Vercel CLI to run the script with proper credentials

### "Rule already exists" Error

This is OK - it means the rules are already seeded. The script handles this gracefully.

### "Column already exists" Error

This is OK - it means the migration is already applied.

---

## What Gets Created

### Migration
- Adds 3 columns to `Lead` table
- Creates 1 index for performance

### Rules (6 total)
- 3 Info/Quotation follow-up rules
- 3 Escalation rules

---

**Status:** Ready to apply! 🚀
