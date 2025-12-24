# Test Plan: Simplified Auto-Reply System

## Prerequisites

1. Database migration completed:
   ```bash
   npx prisma migrate dev --name add_auto_reply_and_reminders
   ```

2. Environment variables set:
   - `OPENAI_API_KEY` or `GROQ_API_KEY`
   - `CRON_SECRET` (for cron endpoints)
   - `DATABASE_URL`

3. WhatsApp webhook configured and accessible

## Test 1: Immediate Auto-Reply (Webhook)

### Setup
1. Create a test lead with:
   - `autoReplyEnabled: true`
   - Contact with valid phone number
   - `allowOutsideHours: true` (for testing outside business hours)

### Steps
1. Send WhatsApp message from test number to your WhatsApp Business number
2. Check webhook logs for:
   - Message received
   - `handleInboundAutoReply` called
   - Auto-reply sent

### Expected Results
- ✅ Inbound message saved to `Message` table with `direction: 'INBOUND'`
- ✅ Auto-reply generated and sent within seconds
- ✅ Outbound message saved to `Message` table with `direction: 'OUTBOUND'`
- ✅ `Lead.lastAutoReplyAt` updated
- ✅ Conversation `lastMessageAt` and `lastOutboundAt` updated

### Verification Queries
```sql
-- Check inbound message
SELECT * FROM "Message" WHERE direction = 'INBOUND' ORDER BY "createdAt" DESC LIMIT 1;

-- Check outbound auto-reply
SELECT * FROM "Message" WHERE direction = 'OUTBOUND' AND "rawPayload"::text LIKE '%autoReply%' ORDER BY "createdAt" DESC LIMIT 1;

-- Check lead updated
SELECT "lastAutoReplyAt" FROM "Lead" WHERE id = <leadId>;
```

## Test 2: Auto-Reply Guardrails

### Test Cases

#### 2.1: Auto-reply disabled
- Set `lead.autoReplyEnabled = false`
- Send message → Should NOT auto-reply
- Check logs: "Auto-reply disabled for this lead"

#### 2.2: Rate limiting
- Send message → Auto-reply sent
- Send another message within 2 minutes → Should NOT auto-reply
- Check logs: "Rate limit: replied recently"

#### 2.3: Muted lead
- Set `lead.mutedUntil = future date`
- Send message → Should NOT auto-reply
- Check logs: "Lead muted until..."

#### 2.4: Human attention needed
- Send message with keywords: "refund", "angry", "sue", "lawyer"
- Should NOT auto-reply
- Task created for human
- Check logs: "Human attention needed"

#### 2.5: AI not trained
- Send message about untrained topic
- Should NOT auto-reply
- Notification created
- Lead marked for human intervention

## Test 3: Language Detection

### Steps
1. Send message in Arabic: "مرحبا، أريد معلومات عن تأشيرة العمل"
2. Verify auto-reply is in Arabic
3. Send message in English: "Hello, I need information about work visa"
4. Verify auto-reply is in English

### Expected Results
- ✅ Arabic message → Arabic reply
- ✅ English message → English reply
- ✅ Language detected correctly

## Test 4: Lead Controls UI

### Steps
1. Navigate to `/leads/[id]` for any lead
2. Verify "Autopilot" card is visible
3. Toggle "Auto-reply enabled" OFF → Save
4. Send message → Should NOT auto-reply
5. Toggle back ON → Save
6. Send message → Should auto-reply
7. Click "Send follow-up now" → Should send immediate follow-up

### Expected Results
- ✅ Autopilot card visible and functional
- ✅ Toggle saves correctly
- ✅ "Send follow-up now" sends message immediately

## Test 5: Reminders UI

### Steps
1. Navigate to `/leads/[id]`
2. Verify "Reminders" card is visible
3. Click "Add" → Create reminder:
   - Type: Follow-up
   - Date/Time: 2 minutes from now
   - Channel: WhatsApp
   - Message: "Test reminder"
4. Verify reminder appears in "Upcoming" list
5. Wait 2 minutes
6. Manually trigger cron: `GET /api/cron/run-reminders?secret=<CRON_SECRET>`
7. Check reminder marked as sent

### Expected Results
- ✅ Reminder created and saved
- ✅ Reminder appears in UI
- ✅ Cron sends reminder when due
- ✅ Reminder marked as `sent: true`

## Test 6: Expiry Sweeper Cron

### Steps
1. Create lead with `expiryDate` = 90 days from now
2. Manually trigger: `GET /api/cron/expiry-sweeper?secret=<CRON_SECRET>`
3. Check `Reminder` table for expiry reminders created

### Expected Results
- ✅ Reminders created for 90/60/30/7 day checkpoints
- ✅ No duplicate reminders
- ✅ Reminders scheduled correctly

## Test 7: No Worker/Queue Artifacts

### Verification
1. Check navigation: `/automation` should return 404
2. Check sidebar: No "Automation" menu item
3. Search codebase: No "Start Worker" or "Stop Worker" buttons visible
4. Check API: `/api/admin/automation/worker` may exist but not used

### Expected Results
- ✅ Automation page removed
- ✅ No worker UI buttons
- ✅ No references to worker state in UI

## Test 8: Build Verification

### Steps
```bash
npm run build
```

### Expected Results
- ✅ Build succeeds without errors
- ✅ No TypeScript errors
- ✅ All imports resolve correctly

## Test 9: End-to-End Flow

### Complete Scenario
1. New WhatsApp message arrives
2. Contact created/updated
3. Lead created/attached
4. Inbound message saved
5. Auto-reply triggered (if enabled)
6. AI reply generated (with language detection)
7. Reply sent via WhatsApp
8. Outbound message saved
9. Conversation updated

### Expected Results
- ✅ All steps complete successfully
- ✅ No errors in logs
- ✅ Customer receives reply within seconds
- ✅ Full audit trail in database

## Manual Test Commands

```bash
# Test reminder cron
curl -X GET "http://localhost:3000/api/cron/run-reminders?secret=your-secret" \
  -H "x-vercel-cron: 1"

# Test expiry sweeper
curl -X GET "http://localhost:3000/api/cron/expiry-sweeper?secret=your-secret" \
  -H "x-vercel-cron: 1"

# Check reminders
curl -X GET "http://localhost:3000/api/leads/1/reminders" \
  -H "Cookie: your-session-cookie"
```

## Success Criteria

✅ All tests pass
✅ No worker/queue references in UI
✅ Auto-reply works immediately
✅ Language detection works
✅ Reminders work via cron
✅ Build succeeds
✅ No TypeScript errors

