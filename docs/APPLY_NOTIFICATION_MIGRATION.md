# Apply Notification.snoozedUntil Migration

## Migration File
`prisma/migrations/20251229190109_add_notification_snoozed_until/migration.sql`

## Quick Apply (Production)

### Option 1: Via Prisma Migrate (Recommended)
```bash
npx prisma migrate deploy
```

This will apply all pending migrations including the `snoozedUntil` column.

### Option 2: Direct SQL (If Prisma Migrate Fails)

Connect to your PostgreSQL database and run:

```sql
-- Add snoozedUntil column
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3);

-- Create index for snoozedUntil queries
CREATE INDEX IF NOT EXISTS "Notification_snoozedUntil_idx" ON "Notification"("snoozedUntil");
```

### Option 3: Via Neon Dashboard

1. Go to Neon Dashboard → Your Project → SQL Editor
2. Copy and paste the SQL from `prisma/migrations/20251229190109_add_notification_snoozed_until/migration.sql`
3. Execute

### Option 4: Via Script

```bash
# Set DATABASE_URL first
export DATABASE_URL="your-connection-string"

# Run the TypeScript script
npx tsx scripts/apply-notification-snoozed-until-migration.ts
```

## Verification

After applying, verify the column exists:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'Notification' 
  AND column_name = 'snoozedUntil';
```

Should return:
```
column_name  | data_type
-------------|----------
snoozedUntil | timestamp without time zone
```

## Notes

- The migration uses `IF NOT EXISTS` so it's safe to run multiple times
- The index is also created with `IF NOT EXISTS`
- This migration is required for the notifications route to work without guards

