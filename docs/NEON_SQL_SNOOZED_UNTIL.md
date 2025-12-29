# Neon SQL Command - Add snoozedUntil to Notification

## Copy and paste this SQL in Neon Dashboard → SQL Editor:

```sql
-- Add snoozedUntil column to Notification table
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3);

-- Create index for snoozedUntil queries
CREATE INDEX IF NOT EXISTS "Notification_snoozedUntil_idx" ON "Notification"("snoozedUntil");
```

## Verification Query (run after):

```sql
-- Check if column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'Notification' 
  AND column_name = 'snoozedUntil';

-- Check if index exists
SELECT indexname, indexdef
FROM pg_indexes 
WHERE tablename = 'Notification' 
  AND indexname = 'Notification_snoozedUntil_idx';
```

## Expected Results:

**Column query should return:**
```
column_name   | data_type    | is_nullable
--------------+--------------+-------------
snoozedUntil  | timestamp(3) | YES
```

**Index query should return:**
```
indexname                        | indexdef
---------------------------------+----------------------------------------
Notification_snoozedUntil_idx   | CREATE INDEX "Notification_snoozedUntil_idx" ON "Notification" USING btree ("snoozedUntil")
```

---

**Note:** The `IF NOT EXISTS` clauses make this safe to run multiple times. If the column/index already exists, it will be skipped.

