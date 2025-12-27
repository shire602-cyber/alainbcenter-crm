# Manual QA Checklist

## Pre-Testing Setup

✅ **Completed:**
- [x] Duplicate conversations repaired (2 groups, 3 conversations merged)
- [x] Channel casing normalized (all channels now lowercase)
- [x] Migration applied (channel normalization)
- [x] Automated deduplication test passed

---

## Test 1: Single Thread Per Contact ✅

**Objective:** Verify only ONE conversation exists per contact per channel

### Steps:
1. Send 3 WhatsApp messages from the same phone number
2. Check inbox
3. Verify conversation count
4. Verify message grouping

### Expected Results:
- [ ] Only **ONE** conversation exists in inbox for this contact
- [ ] All 3 messages appear in the **SAME** conversation thread
- [ ] No duplicate conversation entries
- [ ] Messages are in chronological order

### Actual Results:
- [ ] Pass / [ ] Fail
- Notes: _________________________________

---

## Test 2: Lead Auto-fill ✅

**Objective:** Verify lead fields are automatically populated from messages

### Steps:
1. Send message: "I want freelance visa"
2. Check lead detail page
3. Send message: "I am Indian"
4. Check lead detail page again

### Expected Results:
- [ ] `serviceTypeEnum` is set to `FREELANCE_VISA` OR
- [ ] `requestedServiceRaw` contains "freelance"
- [ ] `dataJson.nationality` contains "Indian" OR
- [ ] Contact nationality is updated to "Indian"

### Actual Results:
- [ ] Pass / [ ] Fail
- Notes: _________________________________

---

## Test 3: AI Reply Deterministic ✅

**Objective:** Verify AI replies follow script, no hallucinations

### Steps:
1. Send first message: "Hi"
2. Verify reply
3. Send second message: "I want business setup"
4. Verify reply
5. Check for forbidden phrases

### Expected Results:
- [ ] First message gets scripted greeting (template-based)
- [ ] Second message gets scripted question (name, activity, etc.)
- [ ] Reply contains **max 1 question mark**
- [ ] No forbidden phrases: "guaranteed", "approval guaranteed", "100%", "inside contact", "government connection"
- [ ] Reply follows template structure (not freeform)

### Actual Results:
- [ ] Pass / [ ] Fail
- Notes: _________________________________

---

## Test 4: No Duplicate Replies ✅

**Objective:** Verify idempotency prevents duplicate replies

### Steps:
1. Send a message
2. Wait for reply
3. Simulate webhook retry (send same message again with same providerMessageId)
4. Check outbound messages

### Expected Results:
- [ ] Only **ONE** outbound reply sent
- [ ] Second attempt is skipped (idempotency)
- [ ] ReplyEngineLog shows duplicate prevention

### Actual Results:
- [ ] Pass / [ ] Fail
- Notes: _________________________________

---

## Test 5: Business Setup Flow ✅

**Objective:** Verify business setup script (max 5 questions)

### Steps:
1. Send: "I want business setup"
2. Answer each question as prompted
3. Count total questions asked
4. Verify handover after completion

### Expected Results:
- [ ] Service detected: business_setup
- [ ] Questions asked in order:
  1. Full name
  2. Business activity
  3. Mainland/Freezone
  4. Partners count
  5. Visas count
- [ ] **Total questions ≤ 5**
- [ ] After 5 questions, handover message shown
- [ ] If user says "cheapest", special offer template shown

### Actual Results:
- [ ] Pass / [ ] Fail
- Notes: _________________________________

---

## Test 6: Admin Debug UI ✅

**Objective:** Verify admin can see FSM state and logs

### Steps:
1. Log in as ADMIN
2. Open a lead with a conversation
3. Check right column for "Reply Engine Debug" panel
4. Expand the panel
5. Verify data displayed

### Expected Results:
- [ ] "Reply Engine Debug" panel visible (admin only)
- [ ] FSM State shows:
  - Service key
  - Stage
  - Asked questions
  - Collected data
- [ ] Recent Logs shows last 5 ReplyEngineLog entries
- [ ] Refresh button works
- [ ] Data updates correctly

### Actual Results:
- [ ] Pass / [ ] Fail
- Notes: _________________________________

---

## Test 7: Channel Normalization ✅

**Objective:** Verify all channels are stored in lowercase

### Steps:
1. Check database directly or via API
2. Verify conversation channels
3. Verify message channels

### Expected Results:
- [ ] All `Conversation.channel` values are lowercase
- [ ] All `Message.channel` values are lowercase
- [ ] No mixed case (e.g., "WHATSAPP" vs "whatsapp")

### Actual Results:
- [ ] Pass / [ ] Fail
- Notes: _________________________________

---

## Test 8: Service Detection Mapping ✅

**Objective:** Verify service keywords map correctly

### Test Cases:
1. "freelance" → `FREELANCE_VISA` or `requestedServiceRaw` contains "freelance"
2. "family visa" → `FAMILY_VISA` or `requestedServiceRaw` contains "family"
3. "business setup" → `MAINLAND_BUSINESS_SETUP` or `requestedServiceRaw` contains "business"
4. "golden visa" → `GOLDEN_VISA` or `requestedServiceRaw` contains "golden"

### Expected Results:
- [ ] Each keyword correctly sets at least one field
- [ ] `serviceTypeEnum` OR `requestedServiceRaw` is always set
- [ ] Lead page displays the service correctly

### Actual Results:
- [ ] Pass / [ ] Fail
- Notes: _________________________________

---

## Summary

**Total Tests:** 8
**Passed:** ___
**Failed:** ___

**Critical Issues Found:**
1. _________________________________
2. _________________________________
3. _________________________________

**Date:** _______________
**Tester:** _______________

---

## Verification Queries

Run these SQL queries to verify fixes:

```sql
-- Check for duplicate conversations (should return empty)
SELECT "contactId", channel, COUNT(*) as count
FROM "Conversation"
GROUP BY "contactId", channel
HAVING COUNT(*) > 1;

-- Check channel casing (all should be lowercase)
SELECT DISTINCT channel FROM "Conversation";
SELECT DISTINCT channel FROM "Message";

-- Check lead fields are populated
SELECT l.id, l."serviceTypeEnum", l."requestedServiceRaw", m.body
FROM "Lead" l
JOIN "Message" m ON m."leadId" = l.id
WHERE m.body ILIKE '%freelance%'
  AND (l."serviceTypeEnum" IS NOT NULL OR l."requestedServiceRaw" IS NOT NULL);
```

