# Comprehensive Testing Plan for Phases 1-5

## Overview

This document outlines comprehensive testing procedures for all implemented phases:
- Phase 1: AI Data Extraction
- Phase 2: Info/Quotation Sharing Detection
- Phase 3: Follow-up Automation
- Phase 4: Agent Fallback System
- Phase 5: Enhanced AI Training

---

## Pre-Testing Setup

### 1. Database Migration

```bash
# Apply migration for info/quotation tracking
npx prisma db push
# OR
npx prisma migrate dev --name add_info_quotation_tracking
```

### 2. Seed Automation Rules

```bash
# Seed info/quotation follow-up rules
curl -X POST http://localhost:3000/api/admin/automation/seed-info-followup \
  -H "Cookie: session=YOUR_SESSION_COOKIE"

# Seed escalation rules
curl -X POST http://localhost:3000/api/admin/automation/seed-escalation \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

### 3. Configure AI Integration

- Ensure OpenAI API key is set in Integration settings
- Test AI connection: `/api/settings/integrations/ai/test`

---

## Phase 1: AI Data Extraction Tests

### Test 1.1: Basic Data Extraction

**Steps:**
1. Send WhatsApp message: "Hi, I'm Ahmed from Egypt. I need a family visa for my wife and 2 kids. My email is ahmed@example.com. My visa expires on 2025-03-15."

**Expected Results:**
- ✅ Contact name updated to "Ahmed"
- ✅ Contact nationality updated to "Egypt"
- ✅ Contact email updated to "ahmed@example.com"
- ✅ Lead serviceType set to "Family Visa" or serviceTypeEnum set to "FAMILY_VISA"
- ✅ Lead expiryDate set to 2025-03-15
- ✅ Lead urgency set to "medium" or "high"
- ✅ AI extraction confidence > 50%

**Verification:**
```sql
SELECT c.fullName, c.nationality, c.email, l.leadType, l.serviceTypeEnum, l.expiryDate, l.urgency
FROM Lead l
JOIN Contact c ON l.contactId = c.id
WHERE c.phone = '+971XXXXXXXXX'
ORDER BY l.createdAt DESC
LIMIT 1;
```

### Test 1.2: Low Confidence Extraction

**Steps:**
1. Send ambiguous message: "Hi"

**Expected Results:**
- ✅ Message stored
- ✅ No data extracted (confidence < 50%)
- ✅ Contact/Lead not updated with incorrect data

### Test 1.3: Extraction with Existing Data

**Steps:**
1. Create lead with name "John Doe"
2. Send message: "Hi, I'm Ahmed"

**Expected Results:**
- ✅ Name NOT overwritten (existing data is better)
- ✅ Only new data extracted (if any)

---

## Phase 2: Info/Quotation Sharing Detection Tests

### Test 2.1: Quotation Detection

**Steps:**
1. As agent, send message: "Here is the quotation for your business setup. The total cost is 5,000 AED."

**Expected Results:**
- ✅ Lead `infoSharedAt` timestamp set
- ✅ Lead `lastInfoSharedType` set to "quotation"
- ✅ Lead `quotationSentAt` timestamp set

**Verification:**
```sql
SELECT infoSharedAt, quotationSentAt, lastInfoSharedType
FROM Lead
WHERE id = LEAD_ID;
```

### Test 2.2: Document Upload Detection

**Steps:**
1. Upload a document to a lead

**Expected Results:**
- ✅ Lead `infoSharedAt` timestamp set
- ✅ Lead `lastInfoSharedType` set to "document"

### Test 2.3: Info Sharing Detection

**Steps:**
1. Send message: "I've shared the information about our services with you."

**Expected Results:**
- ✅ Lead `infoSharedAt` timestamp set
- ✅ Lead `lastInfoSharedType` set to "details"

### Test 2.4: No Detection (False Positive)

**Steps:**
1. Send normal message: "Thank you for your inquiry."

**Expected Results:**
- ✅ `infoSharedAt` NOT set
- ✅ No false positive detection

---

## Phase 3: Follow-up Automation Tests

### Test 3.1: Info Sharing Follow-up

**Steps:**
1. Mark lead with `infoSharedAt` = 2 days ago
2. Run daily automation: `POST /api/automation/run-daily`

**Expected Results:**
- ✅ Follow-up message generated
- ✅ Message sent via WhatsApp/Email
- ✅ Automation log created
- ✅ No duplicate follow-ups

**Verification:**
```sql
SELECT * FROM AutomationRunLog
WHERE leadId = LEAD_ID
AND actionKey LIKE 'info_followup%'
ORDER BY createdAt DESC;
```

### Test 3.2: Quotation Follow-up

**Steps:**
1. Mark lead with `quotationSentAt` = 3 days ago
2. Run daily automation

**Expected Results:**
- ✅ Follow-up message sent
- ✅ Task created for agent (if configured)
- ✅ Next follow-up scheduled

### Test 3.3: Idempotency Check

**Steps:**
1. Run daily automation twice for same lead

**Expected Results:**
- ✅ Only one follow-up sent
- ✅ Second run skipped (duplicate detected)

---

## Phase 4: Agent Fallback System Tests

### Test 4.1: Human Agent Request Detection

**Steps:**
1. Send message: "I want to speak to a human agent"

**Expected Results:**
- ✅ Task created immediately
- ✅ Task priority = HIGH
- ✅ Task due date = today
- ✅ Lead notes updated with request timestamp

**Verification:**
```sql
SELECT * FROM Task
WHERE leadId = LEAD_ID
AND meta LIKE '%human_request%'
ORDER BY createdAt DESC
LIMIT 1;
```

### Test 4.2: Low AI Confidence

**Steps:**
1. Send ambiguous message that AI struggles with
2. AI generates reply with confidence < 70%

**Expected Results:**
- ✅ AI reply still sent
- ✅ Task created for agent review
- ✅ Task priority = NORMAL
- ✅ Task includes confidence score

### Test 4.3: No Reply SLA Breach

**Steps:**
1. Send inbound message
2. Wait 60+ minutes (or manually set timestamp)
3. Run daily automation

**Expected Results:**
- ✅ Task created with URGENT priority
- ✅ Task reason = "no_reply_sla"
- ✅ Task due date = immediately

### Test 4.4: Overdue Follow-up Escalation

**Steps:**
1. Set lead `nextFollowUpAt` = 25 hours ago
2. Run daily automation

**Expected Results:**
- ✅ Task created with HIGH priority
- ✅ Task reason = "overdue_followup"
- ✅ Task includes days overdue

### Test 4.5: Stale Lead Detection

**Steps:**
1. Set lead `lastContactAt` = 8 days ago
2. Run daily automation

**Expected Results:**
- ✅ Task created with NORMAL priority
- ✅ Task reason = "stale_lead"
- ✅ AI follow-up message sent

### Test 4.6: Multiple Escalation Prevention

**Steps:**
1. Create task for lead (escalation)
2. Run daily automation again

**Expected Results:**
- ✅ No duplicate tasks created
- ✅ System skips lead (already has task)

---

## Phase 5: Enhanced AI Training Tests

### Test 5.1: Service-Specific Prompt

**Steps:**
1. Configure service prompt for "FAMILY_VISA":
   ```json
   {
     "customPrompt": "When discussing family visas, emphasize the benefits of sponsoring family members and the required documents.",
     "exampleConversations": [
       {
         "customerMessage": "I need a family visa",
         "agentResponse": "Great! I'd be happy to help you with a family visa. To get started, I'll need a few details..."
       }
     ]
   }
   ```
2. Send message about family visa
3. AI generates reply

**Expected Results:**
- ✅ AI uses service-specific prompt
- ✅ AI response includes family visa context
- ✅ Response quality improved

### Test 5.2: Example Conversations

**Steps:**
1. Add example conversation for service type
2. Send similar customer message
3. Compare AI response

**Expected Results:**
- ✅ AI response similar to example
- ✅ Better context understanding
- ✅ More appropriate tone

### Test 5.3: Common Q&A

**Steps:**
1. Add common Q&A for service type
2. Customer asks one of the questions
3. AI generates reply

**Expected Results:**
- ✅ AI response matches Q&A answer
- ✅ Accurate information provided
- ✅ Consistent responses

---

## Integration Tests

### Test I.1: Complete Flow - New Customer

**Steps:**
1. New customer sends: "Hi, I'm Sarah from UK. I need a business setup in Dubai. My email is sarah@example.com"
2. Wait for AI processing

**Expected Results:**
- ✅ Contact created with name "Sarah", nationality "UK", email "sarah@example.com"
- ✅ Lead created with serviceType "Business Setup"
- ✅ AI qualifies lead
- ✅ AI sends welcome/qualifying message
- ✅ All data extracted correctly

### Test I.2: Complete Flow - Info Sharing Follow-up

**Steps:**
1. Agent shares quotation with customer
2. Wait 2 days
3. Run daily automation

**Expected Results:**
- ✅ Info sharing detected and timestamped
- ✅ After 2 days, follow-up sent automatically
- ✅ Customer receives: "Hi [name], did you have a chance to review the quotation we shared?"

### Test I.3: Complete Flow - Escalation

**Steps:**
1. Customer sends message
2. No reply for 60+ minutes
3. Run daily automation

**Expected Results:**
- ✅ SLA breach detected
- ✅ URGENT task created for agent
- ✅ Agent notified
- ✅ Customer gets response

### Test I.4: Complete Flow - Human Request

**Steps:**
1. Customer sends: "I want to speak to a real person"
2. System processes

**Expected Results:**
- ✅ Human request detected immediately
- ✅ HIGH priority task created
- ✅ AI does NOT send automated reply
- ✅ Agent gets notification

---

## Performance Tests

### Test P.1: Bulk Message Processing

**Steps:**
1. Send 100 test messages simultaneously
2. Monitor processing time

**Expected Results:**
- ✅ All messages processed
- ✅ No data loss
- ✅ Processing time < 5 seconds per message
- ✅ No duplicate leads/contacts

### Test P.2: Daily Automation Performance

**Steps:**
1. Create 1000 leads with various states
2. Run daily automation

**Expected Results:**
- ✅ All leads processed
- ✅ Processing time < 5 minutes
- ✅ No errors
- ✅ Correct tasks created

---

## Edge Cases

### Test E.1: Missing Data

**Steps:**
1. Send message with no extractable data

**Expected Results:**
- ✅ Message still stored
- ✅ No errors thrown
- ✅ System continues normally

### Test E.2: Invalid Dates

**Steps:**
1. Send message with invalid date: "My visa expires on 32/13/2025"

**Expected Results:**
- ✅ Invalid date ignored
- ✅ No errors thrown
- ✅ Other data still extracted

### Test E.3: Special Characters

**Steps:**
1. Send message with emojis, Arabic text, special characters

**Expected Results:**
- ✅ Message stored correctly
- ✅ Data extraction works
- ✅ No encoding issues

### Test E.4: Concurrent Requests

**Steps:**
1. Send same message twice simultaneously

**Expected Results:**
- ✅ Idempotency check works
- ✅ No duplicate messages
- ✅ No duplicate leads

---

## Regression Tests

### Test R.1: Existing Features Still Work

**Steps:**
1. Test renewal reminders
2. Test expiry tracking
3. Test lead qualification
4. Test message sending

**Expected Results:**
- ✅ All existing features work
- ✅ No breaking changes
- ✅ Backward compatibility maintained

---

## Test Checklist

### Phase 1: AI Data Extraction
- [ ] Basic data extraction works
- [ ] Low confidence handled correctly
- [ ] Existing data not overwritten
- [ ] Multiple data points extracted
- [ ] Confidence scores accurate

### Phase 2: Info/Quotation Detection
- [ ] Quotation keywords detected
- [ ] Info keywords detected
- [ ] Document upload triggers detection
- [ ] Timestamps set correctly
- [ ] No false positives

### Phase 3: Follow-up Automation
- [ ] Follow-up sent after 2-3 days
- [ ] Idempotency works
- [ ] Multiple follow-up rules work
- [ ] Automation logs created

### Phase 4: Agent Fallback
- [ ] Human requests detected
- [ ] Low confidence creates tasks
- [ ] SLA breaches escalate
- [ ] Overdue follow-ups escalate
- [ ] Stale leads detected
- [ ] No duplicate tasks

### Phase 5: Enhanced AI Training
- [ ] Service prompts work
- [ ] Example conversations used
- [ ] Common Q&A referenced
- [ ] Prompt enhancement works

### Integration
- [ ] Complete flows work end-to-end
- [ ] No conflicts between phases
- [ ] Performance acceptable
- [ ] Error handling robust

---

## Test Data

### Sample Messages for Testing

**Data Extraction:**
- "Hi, I'm John from USA. I need a business setup. Email: john@example.com"
- "I'm Ahmed, Egyptian. Family visa for wife and 2 kids. Expires 2025-03-15"
- "Sarah here, UK citizen. Freelance visa needed. sarah@test.com"

**Human Requests:**
- "I want to speak to a human"
- "Can I talk to a real person?"
- "Connect me to customer service"
- "I need to speak to an agent"

**Info Sharing:**
- "Here is the quotation: 5,000 AED"
- "I've attached the pricing information"
- "Sent you the details about our services"

**Low Confidence:**
- "Hi"
- "?"
- "Maybe"
- "I don't know"

---

## Success Criteria

✅ **All tests pass**
✅ **No errors in logs**
✅ **Performance within acceptable limits**
✅ **100% follow-up coverage**
✅ **No leads forgotten**
✅ **AI responses quality improved**
✅ **Agent tasks created correctly**

---

## Next Steps After Testing

1. **Fix any issues found**
2. **Optimize performance if needed**
3. **Add more test cases based on real usage**
4. **Monitor production metrics**
5. **Iterate based on feedback**

---

## Notes

- Run tests in development environment first
- Use test database for safety
- Monitor logs during testing
- Document any issues found
- Keep test data realistic
