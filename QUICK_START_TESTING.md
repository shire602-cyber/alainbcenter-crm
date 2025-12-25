# Quick Start - Testing AI Reply System

## 🚀 Quick Setup (3 Steps)

### 1. Apply Migration
```bash
psql $DATABASE_URL -f prisma/migrations/add_auto_reply_log.sql
```

### 2. Regenerate Prisma Client
```bash
npx prisma generate
```

### 3. Run Tests
```bash
npx tsx scripts/test-ai-reply-system.ts
```

## ✅ Expected Results

All 8 tests should pass:
- ✅ Duplicate Conversation Prevention
- ✅ AI Reply Generated (Not Template)
- ✅ Second Message Gets Reply
- ✅ Reply Based on Inbound Message
- ✅ AutoReplyLog Verification
- ✅ No Template Messages
- ✅ Fallback is Minimal
- ✅ DB Query Verification

## 🔍 Quick Verification

```sql
-- Check no duplicates (should return 0)
SELECT "contactId", channel, COUNT(*) 
FROM "Conversation" 
GROUP BY "contactId", channel 
HAVING COUNT(*) > 1;

-- Check no templates (should return 0)
SELECT COUNT(*) 
FROM "Message" 
WHERE direction = 'OUTBOUND' 
  AND body LIKE '%Thank you for your interest%';
```

## 📋 What Was Fixed

1. ✅ Duplicate conversations → Fixed with unique constraint
2. ✅ No auto-reply → Fixed: retrieval never blocks, always sends
3. ✅ AI not sending → Fixed: always generates fresh reply
4. ✅ Saved messages → Fixed: removed all templates
5. ✅ Second messages → Fixed: 10s rate limit

## 📁 Key Files

- `src/lib/autoReply.ts` - Main AI reply logic
- `src/lib/inbound.ts` - Conversation handling
- `scripts/test-ai-reply-system.ts` - Comprehensive tests
- `prisma/migrations/add_auto_reply_log.sql` - Migration

## 🎯 Success = All Tests Pass

If all tests pass, the system is working correctly!

