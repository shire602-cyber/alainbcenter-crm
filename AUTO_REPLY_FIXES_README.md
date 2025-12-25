# Auto-Reply Fixes - Implementation Summary

## Overview

This document describes the fixes applied to resolve 3 critical issues:
1. **Duplicate conversations** (root cause fixed)
2. **No auto-reply** (always sends reply with fallback)
3. **AI not sending** (retrieval never blocks replies)

## Changes Made

### A) Duplicate Conversation Prevention

**Schema Changes:**
- ✅ `Conversation` model already has `@@unique([contactId, channel])` constraint
- ✅ `externalId` is now **only metadata**, NOT used for lookup

**Code Changes:**
- `src/lib/inbound.ts`: Updated to use `findUnique` with `contactId_channel` constraint instead of `findFirst`
- Added race condition handling for concurrent webhook requests
- All conversation lookups now use `(contactId, channel)` as primary key

**Files Changed:**
- `src/lib/inbound.ts` (lines 314-359)

### B) Auto-Reply Always Sends

**Policy Implemented:**
- ✅ If `autoReplyEnabled` and not muted/rate-limited → **Always send reply**
- ✅ If retrieval returns useful context → Use it
- ✅ If retrieval empty/low similarity → Send safe fallback reply
- ✅ If message is high-risk (angry/legal/threat/payment) → Do NOT auto-reply; create human task

**Code Changes:**
- `src/lib/autoReply.ts`: 
  - Retrieval never blocks replies (lines 424-568)
  - Fallback reply added when no context (lines 570-625)
  - High-risk message detection (lines 329-382)
  - Error handling creates human tasks (lines 608-627)

**Files Changed:**
- `src/lib/autoReply.ts` (multiple sections)

### C) Structured Logging

**New Model:**
- `AutoReplyLog` model added to `prisma/schema.prisma`
- Logs all decision points:
  - Inbound parsed
  - contactId, conversationId, leadId
  - autoReplyEnabled status
  - Retriever results (docs count, similarity)
  - Decision: replied / notified_human / skipped + exact reason
  - Send status + error if any

**Files Changed:**
- `prisma/schema.prisma` (added AutoReplyLog model)
- `src/lib/autoReply.ts` (added logging throughout)

## Migration Steps

### 1. Apply Database Migration

```bash
# Generate and apply migration for AutoReplyLog table
npx prisma migrate dev --name add_auto_reply_log

# Optional: Merge existing duplicate conversations
npx tsx scripts/apply-auto-reply-fixes-migration.ts
```

### 2. Verify Fixes

```bash
# Run integration tests
npx tsx scripts/verify-auto-reply-fixes.ts
```

**Expected Output:**
```
🧪 Starting Auto-Reply Fixes Verification Tests

TEST 1: Duplicate Conversation Prevention
✅ PASSED: Only 1 conversation exists for contact X on channel whatsapp

TEST 2: Auto-Reply Without Retrieval (Fallback)
✅ PASSED: Fallback reply used when no retrieval context

TEST 3: Auto-Reply With Retrieval
✅ PASSED: Retrieval context was used for reply

TEST 4: DB Queries Verification
✅ PASSED: All counts are correct

🎉 All tests completed!
```

### 3. Manual Verification

**Check for Duplicate Conversations:**
```sql
-- Should return 0 rows (no duplicates)
SELECT "contactId", "channel", COUNT(*) as count
FROM "Conversation"
GROUP BY "contactId", "channel"
HAVING COUNT(*) > 1;
```

**Check Auto-Reply Logs:**
```sql
-- View recent auto-reply decisions
SELECT 
  id,
  leadId,
  conversationId,
  decision,
  decisionReason,
  hasUsefulContext,
  usedFallback,
  replySent,
  replyStatus,
  createdAt
FROM "AutoReplyLog"
ORDER BY createdAt DESC
LIMIT 10;
```

**Check Conversation Counts:**
```sql
-- Count conversations per contact/channel
SELECT 
  c.id as contactId,
  c.phone,
  conv.channel,
  COUNT(conv.id) as conversationCount
FROM "Contact" c
LEFT JOIN "Conversation" conv ON conv."contactId" = c.id
GROUP BY c.id, c.phone, conv.channel
HAVING COUNT(conv.id) > 1;
```

## Testing Scenarios

### Scenario 1: Duplicate Prevention
1. Send 2 inbound messages from same phone number
2. **Expected**: Only 1 conversation exists
3. **Verify**: Check `Conversation` table - should have 1 row per (contactId, channel)

### Scenario 2: Auto-Reply Without Retrieval
1. Send message with no training documents in vector store
2. **Expected**: Fallback reply sent: "Hello! Thank you for your message. To better assist you, please share:..."
3. **Verify**: Check `AutoReplyLog` - `usedFallback: true`, `hasUsefulContext: false`

### Scenario 3: Auto-Reply With Retrieval
1. Send message about pricing/service (with training docs in vector store)
2. **Expected**: Context-aware reply sent with pricing/service info
3. **Verify**: Check `AutoReplyLog` - `hasUsefulContext: true`, `retrievalDocsCount > 0`

### Scenario 4: High-Risk Message
1. Send message with "refund", "angry", "legal action" keywords
2. **Expected**: No auto-reply, human task created
3. **Verify**: Check `AutoReplyLog` - `decision: 'notified_human'`, `humanTaskCreated: true`

## Files Changed

1. **prisma/schema.prisma**
   - Added `AutoReplyLog` model
   - Added relations to `Contact`, `Lead`, `Conversation`, `Message`

2. **src/lib/inbound.ts**
   - Updated conversation lookup to use `findUnique` with `contactId_channel`
   - Added race condition handling

3. **src/lib/autoReply.ts**
   - Added fallback reply logic
   - Updated retrieval to never block replies
   - Added structured logging throughout
   - Enhanced high-risk message handling

4. **scripts/verify-auto-reply-fixes.ts** (NEW)
   - Integration test script

5. **scripts/apply-auto-reply-fixes-migration.ts** (NEW)
   - Migration script to merge duplicate conversations

## Acceptance Criteria Verification

✅ **A) Duplicate Conversations Fixed**
- Conversation lookup uses `(channel, contactId)` as primary key
- `externalId` is only metadata
- Schema has `@@unique([contactId, channel])`
- Webhook ingestion uses `findUnique` with constraint

✅ **B) Auto-Reply Always Sends**
- Retrieval never blocks replies
- Fallback reply sent when retrieval empty
- High-risk messages create human tasks (no auto-reply)
- Errors create human tasks

✅ **C) Structured Logging**
- All decision points logged to `AutoReplyLog`
- Includes: contactId, conversationId, leadId, retrieval results, decision, send status

✅ **D) Tests Included**
- Integration test script verifies all scenarios
- DB query snippets included in test output

## Next Steps

1. **Run Migration**: `npx prisma migrate dev --name add_auto_reply_log`
2. **Run Tests**: `npx tsx scripts/verify-auto-reply-fixes.ts`
3. **Monitor Logs**: Check `AutoReplyLog` table for decision tracking
4. **Verify in Production**: Send test messages and verify behavior

## Troubleshooting

**Issue: Migration fails with "relation already exists"**
- Solution: The table may already exist. Check with `npx prisma db pull` and compare schemas.

**Issue: Tests fail with "duplicate conversation"**
- Solution: Run the migration script to merge duplicates: `npx tsx scripts/apply-auto-reply-fixes-migration.ts`

**Issue: Auto-reply still not sending**
- Solution: Check `AutoReplyLog` table for decision reasons. Verify `autoReplyEnabled: true` on Lead.

**Issue: No logs in AutoReplyLog**
- Solution: Ensure Prisma client is regenerated: `npx prisma generate`

