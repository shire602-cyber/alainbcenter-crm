# Anti-Duplicate Test Runbook

## Overview
This runbook provides step-by-step instructions for testing the WhatsApp autopilot idempotency system to ensure no duplicate replies are sent.

## Prerequisites

1. **Test Database Setup**
   ```bash
   # Set test database URL
   export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"
   
   # Or use main DB with test suffix
   export TEST_DATABASE_URL="${DATABASE_URL}_test"
   ```

2. **Run Migrations**
   ```bash
   # Apply migrations to test DB
   DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
   ```

3. **Environment Variables**
   ```bash
   # Enable debug logging
   export DEBUG_AUTOPILOT=true
   ```

## Automated Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Unit tests only
npm test -- tests/flow-engine.unit.test.ts

# Integration tests only
npm test -- tests/whatsapp-dedupe.integration.test.ts
```

### Run with Coverage
```bash
npm run test:coverage
```

## Manual End-to-End Testing

### 6.1 Enable Verbose Logging

Set environment variable:
```bash
export DEBUG_AUTOPILOT=true
```

Or in Vercel:
- Go to Project Settings → Environment Variables
- Add: `DEBUG_AUTOPILOT=true`

### 6.2 Real Device Test Steps

#### Test A: Single Message Processing
1. **Send "Hi" from WhatsApp once**
2. **Expected Behavior:**
   - Only 1 reply within 5-15 seconds
   - Check Vercel logs for:
     ```
     [WEBHOOK-LOG] providerMessageId: wamid.xxx, dedupeHit: false
     [OUTBOUND-LOG] triggerProviderMessageId: wamid.xxx, outboundMessageId: xxx
     ```
   - Verify in database:
     ```sql
     SELECT COUNT(*) FROM "OutboundMessageLog" 
     WHERE "triggerProviderMessageId" = 'wamid.xxx';
     -- Should return 1
     ```

#### Test B: Flow State Advancement
1. **Send "Hi"** → AI asks "What type of UAE visa do you currently hold?"
2. **Send "Partner"**
3. **Expected Behavior:**
   - Does NOT ask visa type again
   - Advances to next question (e.g., "Is your family currently inside or outside the UAE?")
   - Check conversation state:
     ```sql
     SELECT "flowStep", "lastQuestionKey", "collectedData" 
     FROM "Conversation" 
     WHERE id = <conversation_id>;
     -- Should show flowStep advanced, collectedData contains sponsorVisaType
     ```

#### Test C: Rapid Multiple Messages
1. **Quickly send 3 messages in a row:**
   - "Hi"
   - "Family visa"
   - "Partner"
2. **Expected Behavior:**
   - Each inbound gets at most 1 outbound
   - Check logs for each `providerMessageId`:
     ```sql
     SELECT "providerMessageId", COUNT(*) 
     FROM "OutboundMessageLog" 
     GROUP BY "triggerProviderMessageId" 
     HAVING COUNT(*) > 1;
     -- Should return 0 rows
     ```

#### Test D: Network Retry Simulation
1. **Turn WiFi off/on** to induce Meta retries
2. **Expected Behavior:**
   - No duplicate replies appear
   - Check logs for `dedupeHit: true` on retries:
     ```
     [IDEMPOTENCY] Duplicate message wamid.xxx - returning 200 OK immediately (dedupeHit: true)
     ```

### 6.3 Webhook Replay Manual Test

1. **Extract webhook payload from logs:**
   ```bash
   # In Vercel logs, find a webhook payload
   # Copy the full JSON payload
   ```

2. **Replay using curl:**
   ```bash
   curl -X POST https://your-app.vercel.app/api/webhooks/whatsapp \
     -H "Content-Type: application/json" \
     -H "X-Hub-Signature-256: sha256=..." \
     -d @webhook-payload.json
   ```

3. **Replay again (duplicate):**
   ```bash
   # Run same command again
   curl -X POST https://your-app.vercel.app/api/webhooks/whatsapp \
     -H "Content-Type: application/json" \
     -H "X-Hub-Signature-256: sha256=..." \
     -d @webhook-payload.json
   ```

4. **Expected Behavior:**
   - First replay: `dedupeHit: false`, outbound sent
   - Second replay: `dedupeHit: true`, NO outbound sent
   - Check logs:
     ```
     [WEBHOOK-LOG] providerMessageId: wamid.xxx, dedupeHit: true
     ```

## Monitoring & Alerts

### 7.1 Scheduled Checks

Run these queries periodically (e.g., every 5 minutes):

```sql
-- Duplicate outbound detection (should always be empty)
SELECT triggerProviderMessageId, count(*)
FROM "OutboundMessageLog"
GROUP BY triggerProviderMessageId
HAVING count(*) > 1;
```

**Alert if:** Query returns any rows → Critical bug detected

### 7.2 Conversation Repeat Detection

```sql
-- Check for conversations asking same question >2 times in 2 minutes
SELECT 
  c.id,
  c."lastQuestionKey",
  COUNT(m.id) as repeat_count
FROM "Conversation" c
JOIN "Message" m ON m."conversationId" = c.id
WHERE 
  m.direction = 'OUTBOUND'
  AND m.body LIKE '%' || c."lastQuestionKey" || '%'
  AND m."createdAt" >= NOW() - INTERVAL '2 minutes'
GROUP BY c.id, c."lastQuestionKey"
HAVING COUNT(m.id) > 2;
```

**Alert if:** Query returns any rows → Flow state bug detected

### 7.3 Log Pattern Monitoring

Monitor Vercel logs for these patterns:

**Good Patterns (Expected):**
```
[IDEMPOTENCY] New message wamid.xxx - proceeding with processing (dedupeHit: false)
[OUTBOUND-LOG] triggerProviderMessageId: wamid.xxx, outboundMessageId: xxx
```

**Bad Patterns (Alert):**
```
[IDEMPOTENCY] Duplicate message wamid.xxx - returning 200 OK immediately (dedupeHit: true)
[OUTBOUND-LOG] triggerProviderMessageId: wamid.xxx, outboundMessageId: xxx
[OUTBOUND-LOG] triggerProviderMessageId: wamid.xxx, outboundMessageId: yyy  # DUPLICATE!
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Idempotency

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - run: npm ci
      - run: npx prisma generate
      
      - name: Setup test database
        env:
          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/test_db
        run: |
          DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
      
      - name: Run tests
        env:
          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/test_db
        run: npm test
```

## Troubleshooting

### Test Failures

1. **"Unique constraint violation" in tests:**
   - This is EXPECTED for duplicate tests
   - Tests should catch and handle these gracefully

2. **"Database connection error":**
   - Ensure TEST_DATABASE_URL is set
   - Check database is running and accessible

3. **"Mock send not called":**
   - Check that `sendTextMessage` is properly mocked
   - Verify webhook handler is calling the mocked function

### Production Issues

1. **Duplicate replies still appearing:**
   - Check `InboundMessageDedup` table for missing entries
   - Verify unique constraint is enforced
   - Check webhook handler returns 200 quickly

2. **Questions repeating:**
   - Check `Conversation.flowStep` and `lastQuestionKey` are being set
   - Verify `wasQuestionAsked()` is being called
   - Check time window (3 minutes) is correct

## Success Criteria

✅ **All automated tests pass**
✅ **Manual tests show no duplicates**
✅ **Monitoring queries return 0 duplicates**
✅ **Logs show proper dedupe hits**
✅ **Flow state advances correctly**

## Evidence Collection

After running tests, collect:

1. **Test Output:**
   ```bash
   npm test > test-results.txt 2>&1
   ```

2. **Sample Logs:**
   - Copy relevant log entries showing dedupe hits
   - Include outbound logs showing single sends

3. **Database Queries:**
   - Run monitoring queries and save results
   - Show that duplicate detection queries return empty

4. **Screenshots:**
   - WhatsApp conversation showing no duplicates
   - Vercel logs showing dedupe hits

