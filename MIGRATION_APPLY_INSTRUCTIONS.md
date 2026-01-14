# Meta OAuth Migration - Manual Application Instructions

## Status

✅ **Migration SQL Fixed**: The table name has been corrected from `"MetaConnection"` to `"meta_connections"`  
✅ **Failed Migration Resolved**: The failed migration state has been marked as rolled back  
⚠️ **Database Connection Issue**: Cannot connect to database automatically - apply manually

## Manual Application Steps

### Option 1: Apply via Neon SQL Editor (Recommended)

1. **Open Neon SQL Editor**
   - Go to https://console.neon.tech/
   - Navigate to your project → SQL Editor
   - Select the `main` branch and `neondb` database

2. **Run the Migration SQL**

   Copy and paste this SQL:

   ```sql
   -- Add OAuth token fields to meta_connections table
   -- These fields store long-lived user tokens and connection metadata for OAuth flow

   ALTER TABLE "meta_connections" 
   ADD COLUMN IF NOT EXISTS "meta_user_access_token_long" TEXT,
   ADD COLUMN IF NOT EXISTS "meta_user_token_expires_at" TIMESTAMP(3),
   ADD COLUMN IF NOT EXISTS "meta_connected_at" TIMESTAMP(3);

   -- Add comments
   COMMENT ON COLUMN "meta_connections"."meta_user_access_token_long" IS 'Encrypted long-lived user access token (60 days)';
   COMMENT ON COLUMN "meta_connections"."meta_user_token_expires_at" IS 'Expiration timestamp for long-lived user token';
   COMMENT ON COLUMN "meta_connections"."meta_connected_at" IS 'Timestamp when OAuth connection was established';
   ```

3. **Click "Run"** to execute the SQL

4. **Verify Success**
   - You should see: "Success. No rows returned"
   - No errors should appear

5. **Mark Migration as Applied** (Optional - for Prisma tracking)
   ```bash
   npx prisma migrate resolve --applied 20250108000001_add_meta_oauth_tokens
   ```

### Option 2: Apply via Prisma (When Connection Restored)

Once your database connection is restored, run:

```bash
npx prisma migrate deploy
```

This will automatically apply the corrected migration.

### Option 3: Use Manual Migration Script (When Connection Restored)

```bash
npx tsx scripts/apply-meta-oauth-migration.ts
```

## Verification

After applying the migration, verify the columns exist:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'meta_connections' 
AND column_name IN ('meta_user_access_token_long', 'meta_user_token_expires_at', 'meta_connected_at')
ORDER BY column_name;
```

**Expected Result**: Should return 3 rows:
- `meta_user_access_token_long` (text, nullable)
- `meta_user_token_expires_at` (timestamp without time zone, nullable)
- `meta_connected_at` (timestamp without time zone, nullable)

## What Was Fixed

1. ✅ **Migration SQL**: Changed table name from `"MetaConnection"` to `"meta_connections"`
2. ✅ **Migration Script**: Updated manual script to use correct table name
3. ✅ **Failed Migration State**: Resolved the failed migration blocking new migrations

## Next Steps

1. Apply the migration using one of the options above
2. Verify columns exist using the verification SQL
3. Test the OAuth connection flow at `/admin/integrations`

## Troubleshooting

If you see errors:
- **"relation meta_connections does not exist"**: The table hasn't been created yet. Run the original migration `20260108112401_add_meta_integration` first.
- **"column already exists"**: The migration was already applied. You can skip this step.
- **Connection errors**: Wait a few minutes and try again, or use Neon SQL Editor directly.
