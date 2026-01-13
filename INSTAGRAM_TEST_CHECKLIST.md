# Instagram Integration Testing Checklist

## Pre-Testing Setup

1. **Ensure local server is running:**
   ```bash
   npm run dev
   ```

2. **Verify automation worker is running:**
   - Check terminal logs for automation worker processing jobs
   - Automation jobs should be processed within a few seconds

3. **Check Instagram integration is connected:**
   - Go to `/admin/integrations` or `/settings/integrations`
   - Verify Meta/Instagram integration shows as "Connected"

## Test 1: Auto-Fill Data Extraction

**Test Message:** Send an Instagram DM with:
```
Hi, I'm John Smith from USA. I need a family visa. My phone number is +971501234567.
```

**Expected Results:**
- [ ] Lead is created/updated with:
  - Name: "John Smith" (or extracted name)
  - Nationality: "USA" (or "United States")
  - Service: "FAMILY_VISA" (or appropriate service type)
  - Phone: "+971501234567" (updated from `ig:USER_ID` format)
- [ ] Check lead detail page shows all extracted data
- [ ] Check terminal logs for:
  - `✅ [INSTAGRAM-ROBUST] Automation job queued for data extraction and auto-reply`
  - `✅ [AUTO-MATCH] Automation job queued for data extraction and auto-reply`
  - Data extraction logs showing service, nationality, phone updates

**Screenshot Required:** Lead detail page showing extracted data

---

## Test 2: Instagram Username Display

**Test Message:** Send any Instagram DM from your test account

**Expected Results:**
- [ ] Inbox shows Instagram username/name (not "Instagram User" or `ig:6221774837922501`)
- [ ] Contact name in lead detail page shows Instagram username/name
- [ ] Check terminal logs for:
  - `✅ [INSTAGRAM-ROBUST] Contact fullName updated with profile name`
  - Profile fetch logs showing name/username

**Screenshot Required:** Inbox showing Instagram username (not generic name)

---

## Test 3: AI Auto-Reply

**Test Message:** Send an Instagram DM asking a question:
```
What documents do I need for a family visa?
```

**Expected Results:**
- [ ] AI reply is generated and sent via Instagram (not WhatsApp)
- [ ] Reply appears in Instagram DM
- [ ] Message record created with `channel: 'instagram'` and `status: 'SENT'`
- [ ] Check terminal logs for:
  - `✅ Queued automation job (type: inbound_message)`
  - `[ORCHESTRATOR] Channel mapping: { mappedProvider: 'instagram' }`
  - `📤 [OUTBOUND-IDEMPOTENCY] Sending Instagram message`
  - `✅ [ORCHESTRATOR] Instagram message sent successfully`

**Screenshot Required:** Instagram DM showing AI reply

---

## Test 4: Manual Outbound Message

**Steps:**
1. Open inbox (`/inbox`)
2. Select Instagram conversation
3. Type a message and send

**Expected Results:**
- [ ] Message sends successfully (no error banner)
- [ ] Message appears in Instagram DM
- [ ] No "Reply not supported for instagram channel" error
- [ ] Check terminal logs for:
  - `✅ [INBOX-REPLY] Message sent successfully (channel: instagram, provider: instagram)`
  - No "Unable to normalize phone number 'ig:...'" errors

**Screenshot Required:** Inbox showing successful send (no errors)

---

## Test 5: Phone Number Update from Instagram ID

**Test Message:** Send an Instagram DM with:
```
My phone number is +971501234567
```

**Expected Results:**
- [ ] Contact phone is updated from `ig:USER_ID` to `+971501234567`
- [ ] Lead detail page shows real phone number
- [ ] Check terminal logs for:
  - `✅ [AUTOMATION] Updated Instagram contact phone from ig:... to +971501234567`
  - Phone normalization logs

**Screenshot Required:** Lead detail page showing updated phone number

---

## Debugging Commands

If tests fail, check:

1. **Automation Jobs:**
   ```sql
   SELECT * FROM "AutomationJob" WHERE type = 'inbound_message' ORDER BY "createdAt" DESC LIMIT 10;
   ```

2. **Instagram Messages:**
   ```sql
   SELECT id, "channel", direction, body, status, "providerMessageId" 
   FROM "Message" 
   WHERE channel = 'instagram' 
   ORDER BY "createdAt" DESC 
   LIMIT 10;
   ```

3. **Contact Updates:**
   ```sql
   SELECT id, phone, "fullName", "phoneNormalized" 
   FROM "Contact" 
   WHERE phone LIKE 'ig:%' OR phone LIKE '+%'
   ORDER BY "updatedAt" DESC 
   LIMIT 10;
   ```

4. **Terminal Logs:**
   - Look for `[INSTAGRAM-ROBUST]`, `[AUTO-MATCH]`, `[ORCHESTRATOR]`, `[OUTBOUND-IDEMPOTENCY]`
   - Check for any errors or warnings

---

## Success Criteria

All 5 tests should pass:
- ✅ Auto-fill extracts service, phone, nationality, name
- ✅ Username displays correctly in inbox
- ✅ AI auto-reply works for Instagram
- ✅ Manual outbound messages work
- ✅ Phone number updates from Instagram ID

If any test fails, check terminal logs and database records to diagnose the issue.
