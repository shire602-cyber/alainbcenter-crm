# Test Evidence Collection Guide

## Purpose
This document provides instructions for collecting evidence that the anti-duplicate system is working correctly.

## Automated Test Evidence

### 1. Run Tests and Capture Output

```bash
# Run all tests and save output
npm test > test-results.txt 2>&1

# Run with coverage
npm run test:coverage > test-coverage.txt 2>&1
```

**Expected Output:**
- All tests pass (green checkmarks)
- No duplicate detection failures
- Coverage report shows test coverage

### 2. Test Results Summary

After running tests, verify:
- ✅ Unit tests: All pass
- ✅ Integration tests: All pass
- ✅ No "duplicate" errors (except expected constraint violations)
- ✅ Mock send calls match expected counts

## Manual Test Evidence

### 3. WhatsApp Conversation Screenshots

**Test Scenario**: Send "Hi" once, verify only one reply

**Evidence to Collect:**
1. Screenshot of WhatsApp conversation showing:
   - One inbound message: "Hi"
   - One outbound reply (AI response)
   - No duplicate replies

2. Timestamp verification:
   - Inbound: 10:00:00
   - Outbound: 10:00:05 (within 5-15 seconds)
   - No additional outbound messages

### 4. Vercel Logs Evidence

**Search for these log patterns:**

**Good Pattern (Expected):**
```
[IDEMPOTENCY] New message wamid.xxx - proceeding with processing (dedupeHit: false)
[WEBHOOK-LOG] providerMessageId: wamid.xxx, contact: 971501234567, conversationId: 123, dedupeHit: false
[OUTBOUND-LOG] triggerProviderMessageId: wamid.xxx, outboundMessageId: 456, flowStep: WAIT_SPONSOR_VISA_TYPE
```

**Duplicate Detection (Expected on Retries):**
```
[IDEMPOTENCY] Duplicate message wamid.xxx - returning 200 OK immediately (dedupeHit: true)
[WEBHOOK-LOG] providerMessageId: wamid.xxx, contact: 971501234567, dedupeHit: true
```

**Bad Pattern (Should NOT appear):**
```
[OUTBOUND-LOG] triggerProviderMessageId: wamid.xxx, outboundMessageId: 456
[OUTBOUND-LOG] triggerProviderMessageId: wamid.xxx, outboundMessageId: 789  # DUPLICATE!
```

### 5. Database Query Evidence

Run monitoring queries and save results:

```sql
-- Should return 0 rows
SELECT triggerProviderMessageId, count(*)
FROM "OutboundMessageLog"
GROUP BY triggerProviderMessageId
HAVING count(*) > 1;
```

**Expected Result:** Empty result set (0 rows)

### 6. Flow State Evidence

**Test Scenario**: "Hi" → "Partner" → Should not ask visa type again

**Query:**
```sql
SELECT 
  "flowKey",
  "flowStep", 
  "lastQuestionKey",
  "collectedData"
FROM "Conversation"
WHERE id = <conversation_id>;
```

**Expected Result:**
- `flowKey`: "family_visa"
- `flowStep`: Advanced (not "WAIT_SPONSOR_VISA_TYPE")
- `collectedData`: Contains `{"sponsorVisaType": "partner"}` or similar

## Webhook Replay Evidence

### 7. Duplicate Webhook Test

1. **Extract webhook payload from logs**
2. **Replay first time:**
   ```bash
   curl -X POST https://your-app.vercel.app/api/webhooks/whatsapp \
     -H "Content-Type: application/json" \
     -d @webhook-payload.json
   ```
   - Expected: `dedupeHit: false`, outbound sent

3. **Replay second time (same payload):**
   ```bash
   # Same command
   ```
   - Expected: `dedupeHit: true`, NO outbound sent

4. **Verify in database:**
   ```sql
   SELECT * FROM "InboundMessageDedup" 
   WHERE "providerMessageId" = 'wamid.xxx';
   -- Should show 1 row with processingStatus = 'COMPLETED'
   ```

## Evidence Checklist

Before considering tests complete, verify:

- [ ] All automated tests pass
- [ ] Test output saved to `test-results.txt`
- [ ] Coverage report generated
- [ ] WhatsApp screenshots show no duplicates
- [ ] Vercel logs show proper dedupe hits
- [ ] Database queries return 0 duplicates
- [ ] Flow state advances correctly
- [ ] Webhook replay test shows dedupe working
- [ ] Monitoring queries return empty (no duplicates)

## Sample Evidence Format

### Test Results
```
✅ All tests passed
✅ 15/15 unit tests passed
✅ 12/12 integration tests passed
✅ 0 duplicate detection failures
```

### Log Evidence
```
[IDEMPOTENCY] New message wamid.test.001 - proceeding (dedupeHit: false)
[OUTBOUND-LOG] triggerProviderMessageId: wamid.test.001, outboundMessageId: 123
[IDEMPOTENCY] Duplicate message wamid.test.001 - returning 200 OK (dedupeHit: true)
```

### Database Evidence
```sql
-- Duplicate detection query
SELECT triggerProviderMessageId, count(*) 
FROM "OutboundMessageLog" 
GROUP BY triggerProviderMessageId 
HAVING count(*) > 1;
-- Result: 0 rows ✅
```

## Submission

Collect all evidence and create a summary document:

1. Test results file
2. Screenshots (WhatsApp conversations)
3. Log excerpts (Vercel logs)
4. Database query results
5. Summary statement confirming all guarantees met

