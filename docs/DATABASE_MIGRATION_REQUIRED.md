# Database Migration Required

## Issue
The database is missing columns that are defined in the Prisma schema:
- `Lead.infoSharedAt`
- `Lead.quotationSentAt`
- `Lead.lastInfoSharedType`

## Solution

Run the following SQL migration on your PostgreSQL database (Neon):

```sql
-- Add info/quotation sharing tracking fields to Lead table
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

## How to Run

### Option 1: Via Neon Dashboard
1. Go to your Neon project dashboard
2. Navigate to the SQL Editor
3. Paste the SQL above and execute

### Option 2: Via psql
```bash
psql <your-connection-string>
# Then paste and run the SQL
```

### Option 3: Via Prisma Migrate (Recommended)
```bash
# Create a new migration
npx prisma migrate dev --name add_info_quotation_tracking

# Or apply the migration file directly
npx prisma migrate deploy
```

The migration file is located at: `prisma/migrations/add_info_quotation_tracking_postgres.sql`

## Temporary Fix Applied
The code has been updated to use `select` instead of `include` for Lead queries to avoid loading these fields until the migration is run. Once the migration is complete, the full Lead model can be loaded again.

