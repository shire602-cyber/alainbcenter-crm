# Comprehensive Testing Guide - AI Reply System

## Overview

This guide provides comprehensive testing to verify all pain points are fixed:
1. ✅ No duplicate conversations
2. ✅ All replies are AI-generated (not templates)
3. ✅ Fallback is minimal (only used when AI fails)
4. ✅ Current inbound message drives AI response
5. ✅ Second messages get replies
6. ✅ No saved/template messages

## Prerequisites

1. **Run Migration** (if not already done):
```bash
npx prisma migrate dev --name add_auto_reply_log
```

2. **Generate Prisma Client**:
```bash
npx prisma generate
```

## Running Tests

### Automated Test Script

```bash
npx tsx scripts/test-ai-reply-system.ts
```

**Expected Output:**
```
🧪 Starting Comprehensive AI Reply System Tests

TEST 1: Duplicate Conversation Prevention
✅ PASSED: Only 1 conversation exists

TEST 2: AI Reply Generated (Not Template)
✅ PASSED: Reply is AI-generated (not template)

TEST 3: Second Message Gets Reply
✅ PASSED: Second message received AI reply

TEST 4: Reply Based on Inbound Message
✅ PASSED: Reply appears context-aware

TEST 5: AutoReplyLog Verification
✅ PASSED: AutoReplyLog shows successful AI reply

TEST 6: No Template Messages in Database
✅ PASSED: No template messages found in database

TEST 7: Fallback is Minimal (Not Template-Like)
✅ PASSED: Fallback is minimal (not template-like)

TEST 8: Database Query Verification
✅ PASSED: All DB counts are correct

🎉 ALL TESTS PASSED!
```

### Manual Testing Steps

#### Test 1: Duplicate Conversation Prevention

1. Send 2 WhatsApp messages from the same phone number
2. **Expected**: Only 1 conversation exists in database
3. **Verify**:
```sql
SELECT "contactId", channel, COUNT(*) as count
FROM "Conversation"
GROUP BY "contactId", channel
HAVING COUNT(*) > 1;
```
Should return 0 rows.

#### Test 2: AI-Generated Reply (Not Template)

1. Send a message: "Hello, I need help with visa"
2. **Expected**: AI-generated reply that acknowledges the message
3. **Verify**: Reply does NOT contain:
   - "Thank you for your interest"
   - "What specific service are you looking for"
   - "What is your timeline"
   - "Looking forward to helping you"

#### Test 3: Second Message Gets Reply

1. Send first message: "Hello"
2. Wait 15+ seconds
3. Send second message: "I need pricing"
4. **Expected**: Both messages get AI replies
5. **Verify**:
```sql
SELECT COUNT(*) 
FROM "Message" 
WHERE direction = 'OUTBOUND' 
  AND "conversationId" = <conversation_id>;
```
Should be >= 2.

#### Test 4: Context-Aware Reply

1. Send message: "I need help with family visa application"
2. **Expected**: Reply mentions visa or family, or is contextually relevant
3. **Verify**: Reply text contains relevant keywords or is clearly AI-generated (not template)

#### Test 5: Fallback is Minimal

1. Disable AI temporarily (or send message that causes AI to fail)
2. **Expected**: Minimal fallback: "Hello! I received your message. Let me review it and get back to you with the information you need."
3. **Verify**: Fallback does NOT ask for multiple items with bullet points

## Database Verification Queries

Run these SQL queries to verify system health:

```sql
-- 1. Check for template messages (should return 0)
SELECT COUNT(*) 
FROM "Message" 
WHERE direction = 'OUTBOUND'
  AND (
    body LIKE '%Thank you for your interest%' 
    OR body LIKE '%What specific service are you looking for%'
    OR body LIKE '%What is your timeline%'
  );

-- 2. Check AutoReplyLog statistics
SELECT 
  decision,
  COUNT(*) as count,
  ROUND(AVG(CASE WHEN usedFallback THEN 1.0 ELSE 0.0 END) * 100, 2) as fallback_percentage
FROM "AutoReplyLog"
GROUP BY decision;

-- 3. Verify conversation uniqueness
SELECT 
  "contactId",
  channel,
  COUNT(*) as count
FROM "Conversation"
GROUP BY "contactId", channel
HAVING COUNT(*) > 1;

-- 4. Check reply success rate
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN replySent = true THEN 1 ELSE 0 END) as sent,
  SUM(CASE WHEN replySent = false THEN 1 ELSE 0 END) as failed,
  ROUND(SUM(CASE WHEN replySent = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM "AutoReplyLog"
WHERE decision = 'replied' OR decision = 'processing';
```

## Expected Behavior

### ✅ Correct Behavior

1. **First Message**: Gets AI-generated greeting/reply
2. **Second Message** (after 10+ seconds): Gets AI-generated reply
3. **Context-Aware**: Reply acknowledges and responds to inbound message
4. **No Templates**: Replies are unique, not saved templates
5. **Minimal Fallback**: Only used when AI fails, simple acknowledgment

### ❌ Incorrect Behavior (Should NOT Happen)

1. **Duplicate Conversations**: Multiple conversations for same contact/channel
2. **Template Messages**: Replies with "Thank you for your interest" + questions
3. **No Reply for Second Message**: Second message doesn't get reply
4. **Saved Messages**: Same reply text sent multiple times
5. **Template-Like Fallback**: Fallback asking for multiple items with bullets

## Troubleshooting

### Issue: Tests fail with "autoReplyLog does not exist"
**Solution**: Run migration:
```bash
npx prisma migrate dev --name add_auto_reply_log
npx prisma generate
```

### Issue: No replies being sent
**Check**:
1. `AutoReplyLog` table - check `decision` and `replySent` fields
2. Lead `autoReplyEnabled` field - should be `true`
3. Rate limiting - check `lastAutoReplyAt` timestamp
4. WhatsApp integration - verify API keys are configured

### Issue: Template messages still being sent
**Check**:
1. Verify fallback reply was updated (should be minimal)
2. Check AI prompts - should have anti-template instructions
3. Verify AI context includes current inbound message first

### Issue: Second messages not getting replies
**Check**:
1. Rate limiting - should be 10 seconds, not 30
2. `lastAutoReplyAt` timestamp - should allow replies after 10s
3. `AutoReplyLog` - check if second message was processed

## Success Criteria

All of these must be true:
- ✅ Only 1 conversation per (contactId, channel)
- ✅ All replies are AI-generated (not templates)
- ✅ No template patterns in database
- ✅ Second messages get replies
- ✅ Replies are context-aware
- ✅ Fallback is minimal (if used)
- ✅ AutoReplyLog tracks all decisions

## Files Changed

1. `src/lib/autoReply.ts` - Updated fallback, AI context, terminology
2. `src/lib/inbound.ts` - Updated comments to "AI-REPLY"
3. `src/lib/ai/prompts.ts` - Strengthened anti-template instructions
4. `src/app/api/webhooks/whatsapp/route.ts` - Updated comments
5. `scripts/test-ai-reply-system.ts` - Comprehensive test script
6. `scripts/verify-ai-replies.sql` - SQL verification queries

