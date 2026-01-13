# Instagram Flow Testing Checklist

## Prerequisites
- Instagram Business account connected
- Webhook URL configured: `https://www.implseai.com/api/webhooks/meta`
- Instagram integration enabled in admin settings
- Local development server running (or production deployed)

---

## Test 1: Instagram Message Reception & Username Display

### Steps:
1. Send an Instagram DM to your business account from a test Instagram account
2. Wait for webhook to process (check terminal logs)

### Screenshots Required:
1. **Inbox View**: Screenshot showing the Instagram conversation in the inbox list
   - Should show: Instagram username/name (NOT "Instagram User")
   - Should show: Last message preview
   - Should show: Timestamp

2. **Conversation Detail**: Screenshot of the opened Instagram conversation
   - Should show: Contact name at top (Instagram username/name, not "Instagram User")
   - Should show: Instagram ID visible (e.g., `ig:6221774837922501`)
   - Should show: Inbound message received

3. **Database Verification** (optional): Screenshot of Contact record
   - Contact `phone` = `ig:USER_ID`
   - Contact `fullName` = Instagram username/name (not "Instagram User")

### Expected Results:
- ✅ Contact created with Instagram ID in phone field
- ✅ Contact fullName shows actual Instagram username/name
- ✅ Conversation created with `channel = 'instagram'`
- ✅ Message stored correctly

---

## Test 2: Phone Number Extraction & Update

### Steps:
1. Send first Instagram message (creates contact with `ig:USER_ID`)
2. Send second Instagram message: "Hi, my phone number is +971501234567" (or any valid phone number)
3. Wait for automation to process (check terminal logs for `[AUTOMATION] Updated Instagram contact phone`)

### Screenshots Required:
1. **Before Phone Update**: Screenshot of lead detail page showing contact phone as `ig:USER_ID`
   - Navigate to: `/leads/[leadId]`
   - Check Contact card section

2. **After Phone Update**: Screenshot of lead detail page showing real phone number
   - Refresh the page after sending message with phone number
   - Should show: Real phone number (e.g., `+971501234567`)
   - Should show: Phone number is editable/clickable

3. **Terminal Logs**: Screenshot showing phone update log
   - Look for: `[AUTOMATION] Updated Instagram contact phone from ig:... to +971...`

### Expected Results:
- ✅ Phone number extracted from message
- ✅ Contact `phone` updated from `ig:USER_ID` to real phone number
- ✅ Contact `phoneNormalized` updated
- ✅ Lead detail page shows real phone number

---

## Test 3: AI Auto-Reply Flow

### Steps:
1. Send an Instagram message that should trigger an AI reply (e.g., "Hello, I need help with visa")
2. Wait for AI reply to be generated and sent (check terminal logs)
3. Check Instagram app to see if reply was received

### Screenshots Required:
1. **Terminal Logs - Orchestrator**: Screenshot showing channel mapping
   - Look for: `[ORCHESTRATOR] Channel mapping: mappedProvider: instagram`
   - Should NOT show: `mappedProvider: whatsapp`

2. **Terminal Logs - Sending**: Screenshot showing Instagram API call
   - Look for: `[OUTBOUND-IDEMPOTENCY] Sending Instagram message to USER_ID`
   - Look for: `[OUTBOUND-IDEMPOTENCY] Instagram API send succeeded`

3. **Instagram App**: Screenshot of Instagram DM showing the AI reply
   - Open Instagram app on test account
   - Check conversation with business account
   - Should show: AI-generated reply message

4. **Inbox View**: Screenshot showing outbound message in inbox
   - Open conversation in inbox
   - Should show: Outbound message (AI reply) in message history
   - Should show: Message status as "SENT"

### Expected Results:
- ✅ Outbound job enqueued
- ✅ Orchestrator maps channel to `provider: 'instagram'` (not 'whatsapp')
- ✅ Message sent via Instagram API
- ✅ Reply appears in Instagram app
- ✅ Message stored with `channel = 'instagram'`

---

## Test 4: Manual Outbound Message

### Steps:
1. Open Instagram conversation in inbox
2. Type a message in the message composer
3. Click "Send" button
4. Verify message was sent

### Screenshots Required:
1. **Before Sending**: Screenshot of inbox conversation view
   - Should show: Message composer at bottom
   - Should show: No error banner (previously showed "Reply not supported for instagram channel")

2. **After Sending**: Screenshot showing message sent successfully
   - Should show: Outbound message in message history
   - Should show: Message status indicator
   - Should NOT show: Error message

3. **Instagram App**: Screenshot of Instagram DM showing manual reply
   - Open Instagram app
   - Check conversation
   - Should show: Manual reply message

### Expected Results:
- ✅ No error banner "Reply not supported for instagram channel"
- ✅ Message composer works
- ✅ Message sent successfully
- ✅ Message appears in Instagram app

---

## Test 5: Auto-Fill Critical Data (Name, Nationality, Service, Phone)

### Steps:
1. Send Instagram message with all data: "Hi, I'm John Smith from USA. I need a family visa. My phone is +971501234567"
2. Wait for automation to process
3. Check lead detail page

### Screenshots Required:
1. **Lead Detail Page - Contact Section**: Screenshot showing auto-filled contact data
   - Navigate to: `/leads/[leadId]`
   - Check Contact card
   - Should show: Name = "John Smith" (or Instagram username if name not extracted)
   - Should show: Phone = "+971501234567" (normalized)
   - Should show: Nationality = "USA" (if extracted)

2. **Lead Detail Page - Service Section**: Screenshot showing auto-filled service
   - Check Pipeline/Service section
   - Should show: Service Type = "FAMILY_VISA" (or extracted service)

3. **Terminal Logs**: Screenshot showing data extraction
   - Look for: `[AUTOMATION] Updated Instagram contact phone`
   - Look for: Extraction logs showing name, nationality, service

4. **Database Verification** (optional): Screenshot of Contact and Lead records
   - Contact: `fullName`, `phone`, `nationality`
   - Lead: `leadType`, `serviceTypeId`

### Expected Results:
- ✅ Name extracted and stored in `Contact.fullName`
- ✅ Phone extracted, normalized, and stored
- ✅ Nationality extracted and stored
- ✅ Service type extracted and linked to lead
- ✅ All data visible in lead detail page

---

## Additional Verification

### Check Terminal Logs For:
- `[INSTAGRAM-ROBUST] Contact fullName updated with profile name`
- `[AUTO-MATCH] Updated Instagram contact with name`
- `[ORCHESTRATOR] Using provider: instagram`
- `[OUTBOUND-IDEMPOTENCY] Instagram API send succeeded`
- No errors related to Instagram channel

### Check Database:
```sql
-- Verify contact has real phone (not ig:USER_ID) after extraction
SELECT id, phone, "phoneNormalized", "fullName", nationality 
FROM "Contact" 
WHERE phone LIKE 'ig:%' 
ORDER BY "createdAt" DESC 
LIMIT 5;

-- Verify conversations are Instagram
SELECT id, channel, "contactId", "leadId"
FROM "Conversation"
WHERE channel = 'instagram'
ORDER BY "createdAt" DESC
LIMIT 5;

-- Verify messages are Instagram
SELECT id, channel, direction, body, "providerMessageId"
FROM "Message"
WHERE channel = 'instagram'
ORDER BY "createdAt" DESC
LIMIT 10;
```

---

## Success Criteria

All tests pass if:
1. ✅ Instagram usernames display correctly (not "Instagram User")
2. ✅ Phone numbers can be extracted and updated from `ig:USER_ID` to real numbers
3. ✅ AI replies work for Instagram (sent via Instagram API, not WhatsApp)
4. ✅ Manual replies work for Instagram (no error banner)
5. ✅ Critical data (name, phone, nationality, service) auto-fills from messages

---

## Notes

- If any test fails, check terminal logs for error messages
- Instagram profile fetching requires proper Meta Graph API permissions
- Phone extraction requires AI to be configured (GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)
- Instagram ID is preserved in `conversation.externalThreadId` even after phone is updated
