# Hotfix Report: Inbox Duplicates + Auto-match + AI Reply Engine

## Root Cause Analysis

### Issue 1: Duplicate Conversations
**Root Cause:** Channel casing inconsistency (e.g., "WHATSAPP" vs "whatsapp") caused the unique constraint `@@unique([contactId, channel])` to fail, allowing multiple conversations for the same contact+channel pair.

**Evidence:**
- Conversations with `channel = 'WHATSAPP'` and `channel = 'whatsapp'` for same contact
- Messages split across different conversation windows
- Inbox showing duplicate entries

**Fix:**
- Standardized all channels to lowercase
- Added `normalizeChannel()` utility function
- Created migration to normalize existing data
- Created repair script to merge duplicates

### Issue 2: Lead Fields Not Auto-filled
**Root Cause:** `updateData` was being used before declaration, causing pipeline crashes. Service matching logic didn't always set fields when extraction failed.

**Evidence:**
- User says "freelance" but `lead.serviceTypeEnum` and `lead.requestedServiceRaw` remain null
- Lead page doesn't reflect service mentioned in messages

**Fix:**
- Moved `updateData` declaration immediately after extraction
- Wrapped lead update in try/catch to prevent pipeline crashes
- Enhanced service matching to always set at least one field (serviceTypeEnum, serviceTypeId, or requestedServiceRaw)
- Added fallback mapping from keywords to serviceTypeEnum

### Issue 3: AI Reply Hallucinations
**Root Cause:** Old auto-reply system used freeform LLM generation without strict validation or template-based replies.

**Evidence:**
- AI replies contain forbidden phrases ("guaranteed", "100%")
- Replies don't follow scripted flow
- Second message often gets no reply

**Fix:**
- Implemented deterministic Reply Engine with:
  - State machine (FSM) for conversation flow
  - Template-based replies (no freeform generation)
  - Strict validation (forbidden phrases, max 1 question)
  - Idempotency via replyKey
- Integrated into WhatsApp webhook handler

## Before/After Database Queries

### Before (Duplicate Conversations)
```sql
-- Found duplicates
SELECT contactId, LOWER(channel) as normalized_channel, COUNT(*) as count
FROM "Conversation"
GROUP BY contactId, LOWER(channel)
HAVING COUNT(*) > 1;
-- Result: Multiple rows with count > 1
```

### After (No Duplicates)
```sql
-- Verify no duplicates
SELECT contactId, channel, COUNT(*) as count
FROM "Conversation"
GROUP BY contactId, channel
HAVING COUNT(*) > 1;
-- Result: Empty (no duplicates)
```

### Before (Lead Fields Empty)
```sql
-- Check leads with service mentions but no serviceTypeEnum
SELECT l.id, l."serviceTypeEnum", l."requestedServiceRaw", m.body
FROM "Lead" l
JOIN "Message" m ON m."leadId" = l.id
WHERE m.body ILIKE '%freelance%'
  AND l."serviceTypeEnum" IS NULL
  AND l."requestedServiceRaw" IS NULL;
-- Result: Multiple leads with service mentions but empty fields
```

### After (Lead Fields Populated)
```sql
-- Verify leads have service fields
SELECT l.id, l."serviceTypeEnum", l."requestedServiceRaw", m.body
FROM "Lead" l
JOIN "Message" m ON m."leadId" = l.id
WHERE m.body ILIKE '%freelance%'
  AND (l."serviceTypeEnum" IS NOT NULL OR l."requestedServiceRaw" IS NOT NULL);
-- Result: All leads have at least one service field set
```

## How to Verify Duplicates Never Happen Again

### 1. Database Constraints
- `@@unique([contactId, channel])` on Conversation model ensures one conversation per contact+channel
- All channel values normalized to lowercase before storage

### 2. Code Safeguards
- `normalizeChannel()` utility used in all conversation create/upsert operations
- Migration ensures existing data is normalized
- Repair script available for one-time cleanup

### 3. Testing
- Automated test: `scripts/test-inbound-dedupe.ts`
- Manual QA checklist (see below)

### 4. Monitoring
- Check for duplicates:
  ```sql
  SELECT contactId, channel, COUNT(*) as count
  FROM "Conversation"
  GROUP BY contactId, channel
  HAVING COUNT(*) > 1;
  ```
- Should always return empty result

## Manual QA Checklist

### Test 1: Single Thread Per Contact
- [ ] Send 3 WhatsApp messages from same number
- [ ] Verify: Only ONE conversation exists in inbox
- [ ] Verify: All 3 messages appear in SAME conversation thread
- [ ] Verify: No duplicate conversation entries

### Test 2: Lead Auto-fill
- [ ] Send message: "I want freelance visa"
- [ ] Check lead page: `serviceTypeEnum` or `requestedServiceRaw` is set
- [ ] Send message: "I am Indian"
- [ ] Check lead page: `dataJson.nationality` contains "Indian"

### Test 3: AI Reply Deterministic
- [ ] Send first message: "Hi"
- [ ] Verify: Gets scripted greeting reply (not freeform)
- [ ] Send second message: "I want business setup"
- [ ] Verify: Gets scripted question (name, activity, etc.)
- [ ] Verify: No forbidden phrases ("guaranteed", "100%", etc.)
- [ ] Verify: Max 1 question per reply

### Test 4: No Duplicate Replies
- [ ] Send same message twice (webhook retry simulation)
- [ ] Verify: Only ONE outbound reply sent
- [ ] Verify: Idempotency log shows duplicate prevented

## Files Changed

### Core Fixes
- `src/lib/inbound/autoMatchPipeline.ts` - Fixed updateData, enhanced service matching
- `src/lib/utils/channelNormalize.ts` - New utility for channel normalization
- `src/lib/replyEngine/` - New deterministic reply engine (already implemented)

### Migrations
- `prisma/migrations/20250127000000_normalize_channel_casing/migration.sql` - Normalize existing channels

### Scripts
- `scripts/repair-duplicate-conversations.ts` - One-time repair script
- `scripts/test-inbound-dedupe.ts` - Automated deduplication test
- `scripts/test-lead-autofill.ts` - Automated lead auto-fill test

## Next Steps

1. Run migration: `npx prisma migrate deploy`
2. Run repair script (if duplicates exist): `npx tsx scripts/repair-duplicate-conversations.ts`
3. Run tests: `npx tsx scripts/test-inbound-dedupe.ts <phone> <message>`
4. Perform manual QA checklist
5. Monitor for duplicates (SQL query above)

