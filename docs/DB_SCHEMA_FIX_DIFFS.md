# DB Schema Fix - Exact File Diffs

**Commit:** `5e90562` - "Fix DB schema drift: add missing columns + soft delete conversations + verification scripts"

---

## Files Changed (9 files)

### New Files (4):

1. **`prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql`**
   - Adds `Conversation.deletedAt` column and index
   - Adds `Notification.snoozedUntil` column and index
   - Uses `IF NOT EXISTS` for idempotency

2. **`scripts/db/verify-schema.ts`**
   - Verifies `Conversation.deletedAt` exists
   - Verifies `Notification.snoozedUntil` exists
   - Checks indexes exist
   - Exits non-zero if mismatch

3. **`scripts/db/verify-fks.ts`**
   - Checks FK constraints for a conversationId
   - Counts dependent rows (OutboundJob, OutboundMessageLog, Message, Task, Notification)
   - Warns if hard delete would violate constraints

4. **`docs/DB_FIX_RUNBOOK.md`**
   - Complete runbook with platform-specific instructions
   - Error code explanations
   - Verification checklist
   - Troubleshooting guide

### Modified Files (5):

1. **`src/app/api/inbox/conversations/route.ts`**
2. **`src/app/api/inbox/conversations/[id]/route.ts`**
3. **`src/app/api/inbox/refresh-intelligence/route.ts`**
4. **`src/app/api/notifications/route.ts`**
5. **`src/app/api/admin/conversations/[id]/delete/route.ts`**

---

## Exact Diffs

### 1. `src/app/api/inbox/conversations/route.ts`

**Before:**
```typescript
// Defensive: Only filter by deletedAt if column exists (migration applied)
// If column doesn't exist, query will fail with P2022, catch and retry without filter
let conversations
try {
  whereClause.deletedAt = null
  conversations = await prisma.conversation.findMany({ ... })
} catch (error: any) {
  if (error.code === 'P2022' || ...) {
    console.warn('⚠️ [INBOX] deletedAt column not found - migration not applied.')
    delete whereClause.deletedAt
    conversations = await prisma.conversation.findMany({ ... }) // Retry without filter
  }
}
```

**After:**
```typescript
// TASK 3: Loud failure if schema mismatch (P2022) - do NOT silently work around
const whereClause: any = {
  deletedAt: null, // Only show non-deleted conversations
}
// ... channel filter ...

let conversations
try {
  conversations = await prisma.conversation.findMany({ where: whereClause, ... })
} catch (error: any) {
  // TASK 3: Loud failure for schema mismatch - do NOT silently work around
  if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
    console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.')
    return NextResponse.json(
      { 
        ok: false, 
        error: 'DB migrations not applied. Run: npx prisma migrate deploy',
        code: 'DB_MISMATCH',
      },
      { status: 500 }
    )
  }
  throw error
}
```

### 2. `src/app/api/notifications/route.ts`

**Before:**
```typescript
// Defensive: Query with snoozedUntil, but fallback if column doesn't exist
let notifications
try {
  notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { snoozedUntil: null },
        { snoozedUntil: { lt: new Date() } },
      ],
    },
  })
} catch (error: any) {
  if (error.code === 'P2022' || ...) {
    console.warn('⚠️ [NOTIFICATIONS] snoozedUntil column not found.')
    notifications = await prisma.notification.findMany({ ... }) // Retry without filter
  }
}
```

**After:**
```typescript
// TASK 3: Loud failure if schema mismatch (P2022) - do NOT silently work around
let notifications
try {
  notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { snoozedUntil: null },
        { snoozedUntil: { lt: new Date() } },
      ],
    },
  })
} catch (error: any) {
  // TASK 3: Loud failure for schema mismatch - do NOT silently work around
  if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
    console.error('[DB-MISMATCH] Notification.snoozedUntil column does not exist. DB migrations not applied.')
    return NextResponse.json(
      { 
        ok: false, 
        error: 'DB migrations not applied. Run: npx prisma migrate deploy',
        code: 'DB_MISMATCH',
      },
      { status: 500 }
    )
  }
  throw error
}
```

### 3. `src/app/api/inbox/refresh-intelligence/route.ts`

**Before:**
```typescript
// Defensive: Handle missing deletedAt column (P2022)
let conversations
try {
  conversations = await prisma.conversation.findMany({
    where: {
      channel: 'whatsapp',
      status: 'open',
      deletedAt: null,
    },
  })
} catch (error: any) {
  if (error.code === 'P2022' || ...) {
    console.warn('⚠️ [REFRESH-INTELLIGENCE] deletedAt column not found.')
    conversations = await prisma.conversation.findMany({
      where: {
        channel: 'whatsapp',
        status: 'open',
      },
    }) // Retry without filter
  }
}
```

**After:**
```typescript
// TASK 3: Loud failure if schema mismatch (P2022) - do NOT silently work around
let conversations
try {
  conversations = await prisma.conversation.findMany({
    where: {
      channel: 'whatsapp',
      status: 'open',
      deletedAt: null,
    },
  })
} catch (error: any) {
  // TASK 3: Loud failure for schema mismatch - do NOT silently work around
  if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
    console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.')
    return NextResponse.json(
      { 
        ok: false, 
        error: 'DB migrations not applied. Run: npx prisma migrate deploy',
        code: 'DB_MISMATCH',
      },
      { status: 500 }
    )
  }
  throw error
}
```

### 4. `src/app/api/inbox/conversations/[id]/route.ts`

**Before:**
```typescript
const conversation = await prisma.conversation.findUnique({ ... })
const isArchived = conversation.deletedAt !== null && conversation.deletedAt !== undefined
```

**After:**
```typescript
// TASK 3: Loud failure if schema mismatch (P2022) - do NOT silently work around
let conversation
try {
  conversation = await prisma.conversation.findUnique({ ... })
} catch (error: any) {
  // TASK 3: Loud failure for schema mismatch - do NOT silently work around
  if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
    console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.')
    return NextResponse.json(
      { 
        ok: false, 
        error: 'DB migrations not applied. Run: npx prisma migrate deploy',
        code: 'DB_MISMATCH',
      },
      { status: 500 }
    )
  }
  throw error
}
// ... check if conversation exists ...
const isArchived = (conversation as any).deletedAt !== null && (conversation as any).deletedAt !== undefined
```

### 5. `src/app/api/admin/conversations/[id]/delete/route.ts`

**Before:**
```typescript
const conversation = await prisma.conversation.findUnique({ ... })
if (conversation.deletedAt) { ... }
await prisma.conversation.update({
  where: { id: conversationId },
  data: {
    deletedAt: new Date(),
    status: 'deleted',
  },
})
```

**After:**
```typescript
// TASK 2: Safe delete strategy - soft delete to prevent FK constraint violations
let conversation
try {
  conversation = await prisma.conversation.findUnique({ ... })
} catch (error: any) {
  // If deletedAt column doesn't exist, fail loudly
  if (error.code === 'P2022' || ...) {
    console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist.')
    return NextResponse.json(
      { 
        ok: false, 
        error: 'DB migrations not applied. Run: npx prisma migrate deploy',
        code: 'DB_MISMATCH',
      },
      { status: 500 }
    )
  }
  throw error
}
// ... check if conversation exists ...
if ((conversation as any).deletedAt) { ... }
try {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      deletedAt: new Date(),
      status: 'deleted',
    },
  })
} catch (error: any) {
  // If deletedAt column doesn't exist, fail loudly
  if (error.code === 'P2022' || ...) {
    console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist.')
    return NextResponse.json({ ok: false, error: 'DB migrations not applied...', code: 'DB_MISMATCH' }, { status: 500 })
  }
  // Handle FK constraint violations (P2003)
  if (error.code === 'P2003') {
    console.error(`[DB-FK] Foreign key constraint violation when deleting conversation ${conversationId}`)
    return NextResponse.json(
      { 
        ok: false, 
        error: 'Cannot delete conversation due to foreign key constraints. This should not happen with soft delete.',
        code: 'FK_CONSTRAINT',
      },
      { status: 500 }
    )
  }
  throw error
}
```

---

## Migration SQL

**File:** `prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql`

```sql
-- Fix schema drift: Ensure Conversation.deletedAt and Notification.snoozedUntil exist
-- This migration is idempotent and safe to run multiple times

-- Add Conversation.deletedAt if missing
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Create index for deletedAt if missing (for inbox filtering)
CREATE INDEX IF NOT EXISTS "Conversation_deletedAt_idx" ON "Conversation"("deletedAt");

-- Add Notification.snoozedUntil if missing
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3);

-- Create index for snoozedUntil if missing
CREATE INDEX IF NOT EXISTS "Notification_snoozedUntil_idx" ON "Notification"("snoozedUntil");
```

---

## Verification Scripts

### `scripts/db/verify-schema.ts`

- Checks `Conversation.deletedAt` exists
- Checks `Notification.snoozedUntil` exists
- Checks indexes exist
- Exits non-zero if mismatch
- Prints exact fix command: `npx prisma migrate deploy`

### `scripts/db/verify-fks.ts`

- Takes `CONVERSATION_ID` env var
- Checks conversation exists
- Counts dependent rows (OutboundJob, OutboundMessageLog, Message, Task, Notification)
- Lists FK constraints
- Warns if hard delete would violate constraints

---

## Summary

✅ **TASK 1**: Authoritative migration created (idempotent)  
✅ **TASK 2**: Admin delete uses soft delete + handles P2003  
✅ **TASK 3**: All defensive fallbacks replaced with loud failures (P2022 -> 500)  
✅ **TASK 4**: Verification scripts created  
✅ **TASK 5**: Complete runbook documentation created

**Build Status:** ✅ Compiled successfully  
**Linter:** ✅ No errors

---

**Next Steps:**
1. Run migration: `DATABASE_URL="..." npx prisma migrate deploy`
2. Verify: `DATABASE_URL="..." npx tsx scripts/db/verify-schema.ts`
3. Deploy and test

