# Production Verification Runbook
## How to Verify AI Reply System in 5 Minutes

This runbook provides step-by-step instructions to verify that the AI reply system is working correctly in production.

### Prerequisites
- Admin access to the CRM
- Access to Vercel logs (or production logs)
- A test WhatsApp number

---

## Step 1: Check AI Health Endpoint (30 seconds)

**Endpoint:** `GET /api/admin/health/ai`

**What to verify:**
1. All outbound logs have `status: "SENT"` or `status: "PENDING"` (no stuck "PENDING" older than 5 minutes)
2. `dedupeCollisions.count` is 0 (no duplicate attempts)
3. `statusCounts.FAILED` is low (< 5% of total)
4. All conversations show `questionsAskedCount <= 5`
5. `lastQuestionKey` values are unique (no repeated questions)

**Expected output:**
```json
{
  "timestamp": "2025-01-28T12:00:00Z",
  "statusCounts": {
    "SENT": 150,
    "PENDING": 2,
    "FAILED": 1
  },
  "dedupeCollisions": {
    "count": 0
  },
  "conversations": [
    {
      "questionsAskedCount": 3,
      "lastQuestionKey": "BS_Q3_ACTIVITY",
      "stateVersion": 5
    }
  ]
}
```

---

## Step 2: Test Single Thread (1 minute)

**Action:** Send a WhatsApp message from a test number, then check the Lead Detail page.

**What to verify:**
1. Open Lead Detail page for the test contact
2. Check Conversation Debug Panel (admin only)
3. Verify:
   - `conversationId` is consistent (same ID for all messages)
   - `externalThreadId` matches the WhatsApp number
   - Inbound and outbound messages appear in the same conversation thread
   - `stateVersion` increments with each message

**Expected:** All messages appear in one conversation thread, not split across multiple threads.

---

## Step 3: Test Idempotency (1 minute)

**Action:** Use the "Simulate Webhook Retry" button in the Conversation Debug Panel.

**What to verify:**
1. Go to Lead Detail page for a conversation with recent messages
2. Click "🔄 Simulate Webhook Retry" button
3. Check the response:
   - Should show "✅ Duplicate detected (idempotency working!)"
   - OR check logs for `[OUTBOUND-IDEMPOTENCY] Duplicate detected`

**Expected:** Duplicate is blocked, no second message sent.

---

## Step 4: Test Question Limits (1 minute)

**Action:** Start a new conversation and count questions asked.

**What to verify:**
1. Send a message like "I need a business setup"
2. Count how many questions the AI asks
3. Check Conversation Debug Panel:
   - `questionsAskedCount` should be <= 5
   - `lastQuestionKey` should change with each question
   - After 5 questions, AI should say "ready for quote" or create a staff task

**Expected:** Maximum 5 questions, no repeated questions, graceful handoff after limit.

---

## Step 5: Test Lead Auto-Fill (1 minute)

**Action:** Send a message with service intent: "I need a freelance visa"

**What to verify:**
1. Check Lead Detail page immediately after message
2. Verify:
   - `serviceTypeEnum` is set (e.g., "FREELANCE_VISA")
   - `serviceTypeId` is set (if ServiceType exists) OR `serviceTypeEnum` is visible in UI
   - `nationality` is set if mentioned
   - Fields are visible in the Lead UI (not hidden in raw data)

**Expected:** Lead fields are populated immediately and visible in UI.

---

## Step 6: Check Production Logs (30 seconds)

**Action:** Review Vercel logs for one inbound message flow.

**What to look for:**
```
[WEBHOOK] -> [UPSERT] -> [AUTO_MATCH] -> [ORCHESTRATOR] -> [OUTBOUND-IDEMPOTENCY] -> [SEND]
```

**Expected log sequence:**
1. `[WEBHOOK] Inbound message received`
2. `[AUTO-MATCH] Pipeline started`
3. `[ORCHESTRATOR] Calling orchestrator`
4. `[OUTBOUND-IDEMPOTENCY] Created PENDING log`
5. `[OUTBOUND-IDEMPOTENCY] Message sent successfully`

**Red flags:**
- Missing `[OUTBOUND-IDEMPOTENCY]` logs
- `[OUTBOUND-IDEMPOTENCY] Duplicate detected` appearing frequently (indicates retry issues)
- `[OUTBOUND-IDEMPOTENCY] Message send failed` without recovery

---

## Quick Checklist

- [ ] AI Health endpoint returns healthy status
- [ ] No duplicate conversations (one thread per contact+channel)
- [ ] Webhook retry simulation blocks duplicates
- [ ] Questions asked <= 5 per conversation
- [ ] Lead fields auto-fill immediately
- [ ] Production logs show correct flow

---

## Troubleshooting

### Issue: Duplicate conversations
**Check:** Conversation Debug Panel shows different `conversationId` for inbound vs outbound
**Fix:** Verify `upsertConversation` is called with normalized channel

### Issue: Questions repeated
**Check:** `lastQuestionKey` in Debug Panel doesn't change
**Fix:** Verify `recordQuestionAsked` only increments when key changes

### Issue: Lead fields not auto-filling
**Check:** `knownFields` in Debug Panel is empty
**Fix:** Verify field extractors are running and persisting to conversation

### Issue: Duplicate outbound messages
**Check:** AI Health endpoint shows `dedupeCollisions.count > 0`
**Fix:** Verify `outboundDedupeKey` unique constraint is working

---

## Success Criteria

✅ **All checks pass** = System is production-ready

If any check fails, review the specific section and fix before deploying to production.

