# Database Migration Steps

## Required Migration

Your PostgreSQL database needs the following columns added to the `Lead` table:

- `infoSharedAt` (TIMESTAMP, nullable)
- `quotationSentAt` (TIMESTAMP, nullable)  
- `lastInfoSharedType` (TEXT, nullable)

## How to Run the Migration

### Option 1: Via Neon Dashboard (Recommended)

1. Go to your Neon project: https://console.neon.tech
2. Select your project
3. Click on "SQL Editor" in the left sidebar
4. Paste the following SQL and click "Run":

```sql
-- Add info/quotation sharing tracking fields to Lead table
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

5. Verify the migration succeeded (you should see "Success" message)

### Option 2: Via psql Command Line

```bash
# Connect to your Neon database
psql "postgresql://[user]:[password]@[host]/[database]?sslmode=require"

# Then run:
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

### Option 3: Via Prisma Migrate (If you have local access)

```bash
# Create migration file
npx prisma migrate dev --name add_info_quotation_tracking --create-only

# Edit the migration file to add the SQL above, then:
npx prisma migrate deploy
```

## Verification

After running the migration, verify it worked:

```sql
-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'Lead' 
AND column_name IN ('infoSharedAt', 'quotationSentAt', 'lastInfoSharedType');
```

You should see all three columns listed.

## Current Status

The application code has been updated to work **without** these columns (defensive queries), but you should add them for full functionality. The app will work, but some features related to info/quotation tracking may not function until the migration is complete.

