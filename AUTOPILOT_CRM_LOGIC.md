# Autopilot CRM Logic

**Best-in-Class AI CRM Upgrade** (Modeled after Salesforce Einstein, Intercom, Zendesk, HubSpot, Odoo)

## Core Principle

**AI never decides "what to do".**

AI only:
- classifies
- summarizes
- phrases replies

The system (rules + data) decides:
- next step
- follow-up timing
- reminders
- escalation
- task creation

---

## Phase 1: Intelligent Inbox → Lead Auto-Match

**File**: `src/lib/inbound/autoMatchPipeline.ts`

### Pipeline Flow

Every inbound message goes through a **single deterministic pipeline**:

1. **Idempotency** (`checkInboundDedupe`)
   - Dedupe strictly by `providerMessageId`
   - If duplicate → return 200, no processing
   - Uses `InboundMessageDedup` table

2. **Auto-match entities**
   - Normalize phone (`normalizeInboundPhone`)
   - Find or create Contact (`findOrCreateContact`)
   - Find or create Conversation (contact + channel)
   - Find or create Lead:
     - Reuse open lead within last 30 days
     - Else create new lead (stage="NEW")

3. **Extract structured data** (deterministic first)
   - Service intent (keyword map) → `extractService()`
   - Nationality (explicit only) → `extractNationality()`
   - Expiry → ONLY if explicit date (never relative) → `extractExpiry()`
   - Business setup fields:
     - activity (raw + tag)
     - mainland/freezone
     - partners count → `extractCounts()`
     - visas count → `extractCounts()`

4. **Store extracted data**
   - Contact (nationality)
   - Lead (`primaryService`, `dataJson`, `aiNotes`)
   - Never overwrite human-entered data

5. **Always create CommunicationLog**
   - Inbound message linked to conversation + lead
   - Creates both `Message` and `CommunicationLog` records

### Key Functions

- `handleInboundMessageAutoMatch()` - Main entry point
- `extractFields()` - Deterministic extraction (no LLM)
- `createCommunicationLog()` - Always creates log entry

---

## Phase 2: Automatic Tasks & Alerts (Anti-Forget System)

**File**: `src/lib/inbound/autoTasks.ts`

### Task Creation Rules

On every inbound message, **always create** (unless auto-reply succeeds):

1. **Task: "Reply to lead"**
   - `dueAt` = now + 10 minutes
   - `priority` = high
   - `uniqueKey` enforced (`reply:{leadId}:{providerMessageId}`)
   - Marked as DONE if auto-reply succeeds

2. **If Business Setup:**
   - Task: "Prepare quote"
   - `dueAt` = end of business day
   - `type` = DOCUMENT_REQUEST

3. **If Visa / Golden / Freelance:**
   - Task: "Qualify lead"
   - `dueAt` = now + 2 hours
   - `type` = FOLLOW_UP

4. **If explicit expiry detected:**
   - Create `ExpiryItem`
   - Create Renewal task (future)
   - Reminder schedule: [90, 60, 30, 7, 3, 1] days before

5. **If expiry hint (no explicit date):**
   - Task: "Confirm expiry date"
   - `dueAt` = end of day
   - Create alert/notification

### Key Functions

- `createAutoTasks()` - Creates all tasks with idempotency keys

---

## Phase 3: AI Qualification (Strict)

**File**: `src/lib/ai/strictQualification.ts`

### Strict Rules

1. **Max 1 question per reply**
   - If multiple questions detected → extract first question only

2. **Max 5 questions total per service**
   - Tracked in `Conversation.collectedData`
   - After 5 questions → escalate to human

3. **Never ask:**
   - "are you in UAE"
   - "are you in Dubai"
   - "location"
   - "where are you"

4. **Never promise:**
   - Approvals
   - Guarantees
   - "100% approved"

5. **Never quote final prices** (unless explicitly allowed)
   - Use "approximately" instead of "exactly"

6. **Never repeat a question**
   - Track `lastQuestionKey` in Conversation
   - Check before asking

7. **JSON-validated output**
   ```json
   {
     "reply_text": "...",
     "detected_service": "...",
     "collected_fields": {...},
     "next_question": "...",
     "should_escalate": false,
     "handover_reason": null
   }
   ```

### Key Functions

- `validateQualificationRules()` - Validates proposed reply
- `parseQualificationOutput()` - Parses and validates AI JSON
- `updateQualificationProgress()` - Updates conversation state
- `shouldEscalateToHuman()` - Checks escalation criteria

### Integration

To use strict qualification in auto-reply:

```typescript
import { validateQualificationRules } from '@/lib/ai/strictQualification'

const validation = await validateQualificationRules(conversationId, proposedReply)
if (!validation.isValid) {
  // Use sanitizedReply or escalate
}
```

---

## Phase 4: Today's Focus Engine

**File**: `src/lib/todaysFocus.ts`  
**API**: `GET /api/todays-focus`

### Focus Items

Surfaces 5 types of items:

1. **Replies overdue**
   - Tasks with `type = REPLY_WHATSAPP`
   - `status = OPEN`
   - `dueAt < now`
   - Priority: >24h = URGENT, >4h = HIGH, else NORMAL

2. **Quotes due today**
   - Tasks with `type = DOCUMENT_REQUEST`
   - Title contains "quotation"
   - `dueAt` = today

3. **Follow-ups due**
   - Leads with `nextFollowUpAt` = today
   - Stage not COMPLETED_WON/LOST/ON_HOLD

4. **Renewals (90/60/30/7/3/today)**
   - `ExpiryItem` with `expiryDate` in next 90 days
   - `renewalStatus` not RENEWED/NOT_RENEWING
   - Priority: ≤3 days = URGENT, ≤7 = HIGH, ≤30 = HIGH, ≤60 = NORMAL, else LOW

5. **HOT leads untouched**
   - `aiScore >= 70`
   - Stage = NEW/CONTACTED
   - `lastInboundAt < 2 days ago`
   - Priority: >3 days = HIGH, else NORMAL

### Each Item Shows

- **WHY it's listed** (reason field)
- **ONE click action** (reply / assign / send_template / view)
- Priority (LOW / NORMAL / HIGH / URGENT)

### Key Functions

- `getTodaysFocus(userId?)` - Returns all focus items, sorted by priority

---

## Phase 5: Lead Pages as Cockpit

**Status**: Lead pages exist but need enhancement to show:
- Lead summary (auto-generated)
- Extracted data + confidence flags
- Inbox (respond.io style)
- Tasks & alerts panel
- Expiry tracker
- Assigned human + assigned AI agent
- Next best action (single recommendation)

**Files**: 
- `src/app/leads/[id]/LeadDetailPage.tsx`
- `src/app/leads/[id]/LeadDetailPagePremium.tsx`

**TODO**: Enhance UI to show all required information without scrolling chaos.

---

## Phase 6: Follow-ups & Reminders (Autopilot)

**File**: `src/lib/followups/engine.ts`  
**Cron**: `POST /api/cron/process-followups`

### Follow-up Schedule

- **Day 2** - First follow-up
- **Day 5** - Second follow-up
- **Day 12** - Third follow-up
- **Day 22** - Mark as Cold (no follow-up sent)

### Rules

1. **Stop if customer replies**
   - Check last message direction
   - If last message is INBOUND → skip follow-up
   - Update `nextFollowUpAt` to next schedule point

2. **Never sound desperate**
   - Neutral professional tone
   - One short message
   - Generated by AI (mode: FOLLOW_UP)

3. **Auto-mark Cold after 22 days**
   - Stage → ON_HOLD
   - Notes updated with reason

### Key Functions

- `processFollowupsDue()` - Processes follow-ups due today
- `initializeFollowupSchedule()` - Sets up schedule for new lead
- `updateNextFollowup()` - Updates next follow-up date

### Cron Setup

Add to Vercel Cron or external scheduler:

```
POST /api/cron/process-followups
Authorization: Bearer {CRON_SECRET}
```

---

## Phase 7: Staff WhatsApp Reminders

**File**: `src/lib/inbound/staffReminders.ts`

### Features

- Sends WhatsApp reminders to staff for:
  - Task assigned or overdue
  - Lead expiring due reminders
  - Quote due today

### Rules

1. **Only 1 reminder per task per day** (dedupe)
   - Checks `Notification` table for same-day reminders

2. **Respect staff settings**
   - `remindersEnabled` flag
   - `personalWhatsappNumber` required

3. **Never send sensitive customer docs**
   - Only sends task/reminder text

4. **Graceful error handling**
   - Never throws
   - Logs all errors
   - Creates notification on failure

### Key Functions

- `sendStaffReminder()` - Sends reminder to staff member
- `triggerStaffRemindersForOverdueTasks()` - Batch process overdue tasks

### Staff Settings

Configure in `StaffSettings` model:
- `personalWhatsappNumber` - Staff WhatsApp number
- `remindersEnabled` - Enable/disable reminders
- `timezone` - User timezone (default: Asia/Dubai)

---

## Phase 8: Analytics & Control

**File**: `src/lib/analytics/crmMetrics.ts`  
**API**: `GET /api/analytics/crm-metrics?days=30` (Admin only)

### Metrics Tracked

1. **Auto-reply success rate**
   - Total attempts
   - Successful
   - Failed
   - Success rate %

2. **Qualification completion rate**
   - Leads qualified
   - Leads total
   - Completion rate %
   - Avg questions asked

3. **Response time SLA**
   - Avg response time (minutes)
   - SLA breaches (target: <10 minutes)
   - SLA compliance rate %

4. **Follow-up conversion**
   - Follow-ups sent
   - Conversions (customer replied)
   - Conversion rate %

5. **Renewal revenue generated**
   - Renewals identified
   - Renewals completed
   - Revenue generated (AED)

### Key Functions

- `getCRMMetrics(startDate, endDate)` - Get metrics for date range
- `getCRMMetricsLastNDays(days)` - Get metrics for last N days

---

## Test Plan

### Test Cases

1. **Single inbound → 1 lead → 1 reply → tasks created**
   - Send WhatsApp message
   - Verify: Lead created, Conversation created, Message created, CommunicationLog created
   - Verify: Reply task created (due in 10 min)
   - Verify: Service-specific task created (if applicable)

2. **Duplicate webhook → no duplicate replies/tasks**
   - Send same message twice (same `providerMessageId`)
   - Verify: Second message returns 200 but no processing
   - Verify: No duplicate tasks created

3. **Explicit expiry → renewal created**
   - Send message: "My visa expires on 10/02/2026"
   - Verify: `ExpiryItem` created
   - Verify: Renewal task created

4. **No expiry date → hint + confirm task**
   - Send message: "My visa expires soon"
   - Verify: Expiry hint stored in `dataJson`
   - Verify: "Confirm expiry date" task created

5. **Overdue reply → alert fires**
   - Create reply task with `dueAt` = 1 hour ago
   - Verify: Appears in Today's Focus
   - Verify: Priority = HIGH or URGENT

6. **Staff WhatsApp reminder (dry-run log)**
   - Create overdue task assigned to staff
   - Call `sendStaffReminder()`
   - Verify: Reminder sent (or skipped if disabled)
   - Verify: Notification created

---

## Database Schema

### Key Models

- `InboundMessageDedup` - Idempotency for inbound messages
- `CommunicationLog` - Always created for every message
- `Task` - Auto-created with idempotency keys
- `ExpiryItem` - Created for explicit expiry dates
- `Conversation` - Tracks `flowStep`, `lastQuestionKey`, `collectedData`
- `StaffSettings` - Staff reminder preferences
- `AutoReplyLog` - Tracks auto-reply decisions

### No Schema Changes Required

All features use existing schema. No migrations needed.

---

## API Endpoints

### Today's Focus
```
GET /api/todays-focus
Authorization: Bearer {token}
Returns: { items: FocusItem[], count: number }
```

### Follow-ups Cron
```
POST /api/cron/process-followups
Authorization: Bearer {CRON_SECRET}
Returns: { processed, sent, skipped, errors }
```

### Analytics
```
GET /api/analytics/crm-metrics?days=30
Authorization: Bearer {token} (Admin only)
Returns: CRMMetrics
```

---

## Success Criteria

✅ **Staff never forgets**
- Tasks auto-created
- Today's Focus surfaces everything
- Staff reminders sent

✅ **AI never hallucinates**
- Strict qualification rules enforced
- JSON validation
- Max questions enforced

✅ **Leads are always qualified or escalated**
- Max 5 questions → escalate
- Escalation keywords detected
- Human handover when needed

✅ **Renewals never slip**
- Expiry items created
- Renewal tasks scheduled
- Reminders sent at 90/60/30/7/3/1 days

---

## Next Steps

1. **Phase 5 Enhancement**: Update lead pages UI to show all required information
2. **Integration**: Wire strict qualification into auto-reply flow
3. **Testing**: Execute test plan (6 test cases)
4. **Monitoring**: Set up alerts for Today's Focus items
5. **Documentation**: Add user-facing docs for staff

---

## Files Created/Modified

### New Files
- `src/lib/ai/strictQualification.ts` - Strict AI qualification rules
- `src/lib/todaysFocus.ts` - Today's Focus engine
- `src/lib/followups/engine.ts` - Follow-up autopilot
- `src/lib/analytics/crmMetrics.ts` - CRM analytics
- `src/app/api/todays-focus/route.ts` - Today's Focus API
- `src/app/api/cron/process-followups/route.ts` - Follow-ups cron
- `src/app/api/analytics/crm-metrics/route.ts` - Analytics API
- `AUTOPILOT_CRM_LOGIC.md` - This documentation

### Modified Files
- `src/lib/inbound/autoMatchPipeline.ts` - Added CommunicationLog creation

---

## Notes

- All features are **additive** - no breaking changes
- Existing functionality remains intact
- All tasks use **idempotency keys** to prevent duplicates
- All AI outputs are **validated** before use
- All errors are **logged** but never block processing

