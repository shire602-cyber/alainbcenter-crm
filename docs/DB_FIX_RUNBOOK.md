# Database Schema Fix Runbook

## Overview

This runbook addresses database schema drift issues:
- **P2022**: Column does not exist (e.g., `Conversation.deletedAt`, `Notification.snoozedUntil`)
- **P2003**: Foreign key constraint violation (e.g., when deleting conversations)

## Root Cause

Production database is missing columns that exist in Prisma schema:
- `Conversation.deletedAt` - Soft delete timestamp
- `Notification.snoozedUntil` - Snooze feature timestamp

These columns are required for:
- Inbox filtering (exclude soft-deleted conversations)
- Notification snooze feature
- Safe conversation deletion (soft delete prevents FK violations)

## Solution

### Step 1: Apply Migration

Run the authoritative migration that adds missing columns:

```bash
# Option 1: Via Prisma (recommended)
DATABASE_URL="your-production-db-url" npx prisma migrate deploy

# Option 2: Via Neon Dashboard SQL Editor
# Copy and paste SQL from:
# prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql
```

**Migration SQL:**
```sql
-- Add Conversation.deletedAt if missing
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Create index for deletedAt if missing
CREATE INDEX IF NOT EXISTS "Conversation_deletedAt_idx" ON "Conversation"("deletedAt");

-- Add Notification.snoozedUntil if missing
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3);

-- Create index for snoozedUntil if missing
CREATE INDEX IF NOT EXISTS "Notification_snoozedUntil_idx" ON "Notification"("snoozedUntil");
```

### Step 2: Verify Schema

Run the verification script:

```bash
DATABASE_URL="your-production-db-url" npx tsx scripts/db/verify-schema.ts
```

**Expected output:**
```
✅ Conversation.deletedAt: EXISTS
✅ Notification.snoozedUntil: EXISTS
✅ Conversation_deletedAt_idx: EXISTS
✅ Notification_snoozedUntil_idx: EXISTS
✅ Schema verification PASSED
```

**If verification fails:**
- Check `DATABASE_URL` is correct
- Ensure you have database permissions
- Re-run migration if needed

### Step 3: Verify Foreign Keys

Check FK constraints for a specific conversation:

```bash
DATABASE_URL="your-production-db-url" CONVERSATION_ID=123 npx tsx scripts/db/verify-fks.ts
```

**Expected output:**
```
✅ Conversation 123 exists
   Status: ACTIVE
📊 Dependent row counts:
   OutboundJob: 5
   OutboundMessageLog: 10
   Message: 25
   Task: 2
   Notification: 1
🔗 Foreign key constraints:
   ✅ Message.conversationId -> Conversation.id
   ✅ Notification.conversationId -> Conversation.id
   ✅ OutboundJob.conversationId -> Conversation.id
   ✅ OutboundMessageLog.conversationId -> Conversation.id
   ✅ Task.conversationId -> Conversation.id
```

## Required Environment Variables

Set these before running migrations or scripts:

- `DATABASE_URL` - PostgreSQL connection string (pooler)
- `DIRECT_URL` - PostgreSQL direct connection (for migrations)

**Get from:**
- **Neon**: Dashboard → Your Project → Connection Details → Connection String
- **Vercel Postgres**: Dashboard → Storage → Postgres → Connection String
- **Supabase**: Dashboard → Settings → Database → Connection String

## Error Codes Explained

### P2022: Column Does Not Exist

**Error:**
```
Invalid `prisma.conversation.findMany()` invocation:
Error converting field "deletedAt" of expected non-nullable type "DateTime", found incompatible value of "null".
```

**Or:**
```
Column "deletedAt" does not exist
```

**Resolution:**
1. Run migration: `npx prisma migrate deploy`
2. Verify: `npx tsx scripts/db/verify-schema.ts`
3. Restart application

**Application behavior:**
- Returns `500` with error: `"DB migrations not applied. Run: npx prisma migrate deploy"`
- Logs: `[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.`

### P2003: Foreign Key Constraint Violation

**Error:**
```
Foreign key constraint failed on the field: `OutboundJob_conversationId_fkey`
```

**Resolution:**
- **DO NOT** hard delete conversations
- Use soft delete (set `deletedAt` timestamp) - already implemented in admin delete endpoint
- Soft delete preserves referential integrity

**Application behavior:**
- Admin delete endpoint uses soft delete by default
- If hard delete attempted, returns `500` with error: `"Cannot delete conversation due to foreign key constraints"`

## Platform-Specific Instructions

### Neon (PostgreSQL)

1. **Get connection string:**
   - Neon Dashboard → Your Project → Connection Details
   - Copy "Connection String" (pooler) for `DATABASE_URL`
   - Copy "Direct Connection" for `DIRECT_URL`

2. **Run migration:**
   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   ```

3. **Or via SQL Editor:**
   - Neon Dashboard → SQL Editor
   - Paste migration SQL
   - Execute

### Vercel Postgres

1. **Get connection string:**
   - Vercel Dashboard → Your Project → Storage → Postgres
   - Copy "Connection String"

2. **Run migration:**
   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   ```

### Supabase

1. **Get connection string:**
   - Supabase Dashboard → Settings → Database
   - Copy "Connection String" (use "Connection pooling" for `DATABASE_URL`)

2. **Run migration:**
   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   ```

## Verification Checklist

After applying migration, verify:

- [ ] `npx tsx scripts/db/verify-schema.ts` exits with code 0
- [ ] Inbox loads without errors (no P2022)
- [ ] Notifications load without errors (no P2022)
- [ ] Admin delete conversation works (soft delete)
- [ ] No P2003 errors in logs

## Troubleshooting

### Migration fails with "permission denied"

**Solution:**
- Check database user has `ALTER TABLE` permissions
- Run migration SQL directly in database dashboard (Neon SQL Editor, etc.)

### Migration says "already exists"

**Solution:**
- This is expected - migration uses `IF NOT EXISTS`
- Verify with: `npx tsx scripts/db/verify-schema.ts`

### Application still shows P2022 errors after migration

**Solution:**
1. Restart application (Vercel redeploy)
2. Clear Prisma client cache: `npx prisma generate`
3. Verify schema: `npx tsx scripts/db/verify-schema.ts`

### Soft delete not working

**Solution:**
1. Verify `deletedAt` column exists: `npx tsx scripts/db/verify-schema.ts`
2. Check admin delete endpoint logs
3. Verify conversation has `deletedAt` set in database

## Production Deployment

### Pre-Deployment

1. ✅ Set `DATABASE_URL` and `DIRECT_URL` in Vercel Environment Variables
2. ✅ Run migration: `DATABASE_URL="..." npx prisma migrate deploy`
3. ✅ Verify schema: `DATABASE_URL="..." npx tsx scripts/db/verify-schema.ts`

### Post-Deployment

1. ✅ Check application logs for `[DB-MISMATCH]` errors (should be none)
2. ✅ Test inbox loads correctly
3. ✅ Test notifications load correctly
4. ✅ Test admin delete conversation (soft delete)

## Related Files

- **Migration**: `prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql`
- **Schema**: `prisma/schema.prisma` (lines 348, 745)
- **Verification Script**: `scripts/db/verify-schema.ts`
- **FK Verification Script**: `scripts/db/verify-fks.ts`
- **Admin Delete**: `src/app/api/admin/conversations/[id]/delete/route.ts`

---

**Last Updated:** 2025-01-30  
**Status:** ✅ Ready for Production

