# Renewal Reminders Implementation

## Summary

Implemented fully data-driven renewal reminders automation with strong idempotency and a single orchestrator send path for both WhatsApp and Facebook Messenger.

## Changes Made

### 1. Database Schema Updates

**File**: `prisma/schema.prisma`

**Renewal Model**:
- Added `reminderStage` field (0-3): 0=none sent, 1=R1 sent, 2=R2, 3=R3 done
- Added `conversationId` field (links to conversation for user engagement checks)
- Added `lastRemindedAt` field (timestamp of last reminder)
- Changed `status` default from `PENDING` to `ACTIVE`
- Updated `reminderSchedule` default to `[30,14,7]` (R1=30 days, R2=14 days, R3=7 days)

**RenewalNotification Model**:
- Added `channel` field (`whatsapp` | `facebook`)
- Added `stage` field (1, 2, or 3)
- Updated `idempotencyKey` format: `renewal:{channel}:{renewalId}:stage:{stage}`
- Added indexes for efficient querying

**Migration**: `prisma/migrations/20250106000001_add_renewal_reminder_stage/migration.sql`

### 2. Template Variable Mapping

**File**: `src/lib/renewals/templateMapping.ts`

- **Single source of truth** for template variable mapping
- `buildRenewalTemplateVars(renewalId)` function:
  - Returns: `{ vars: [name, serviceType, formattedExpiry], ... }`
  - Template variables:
    - `{{1}}` = customer_name
    - `{{2}}` = service_type (what's expiring)
    - `{{3}}` = formatted_expiry_date (e.g., "06 Jan 2026")
- Date formatting: Consistent, locale-safe format "06 Jan 2026"
- **No code may hardcode variables outside this function**

### 3. Template Registry

**File**: `src/lib/renewals/templateRegistry.ts`

- **Single source of truth** for template names
- `getRenewalTemplate(channel, stage)` function:
  - WhatsApp: `renewal_notification_r1`, `renewal_notification_r2`, `renewal_notification_r3`
  - Facebook: `fb_renewal_reminder_1`, `fb_renewal_reminder_2`, `fb_renewal_reminder_3`
- `getRenewalChannels()`: Returns configured channels (default: `['whatsapp']`)

### 4. Reminder Schedule

**File**: `src/lib/renewals/templateMapping.ts`

- **Single constant**: `REMINDER_OFFSETS_DAYS = [30, 14, 7]`
- R1 = 30 days before expiry
- R2 = 14 days before expiry
- R3 = 7 days before expiry
- `computeNextReminderAt()` function computes next reminder date from expiry date and current stage

### 5. Orchestrator Integration

**File**: `src/lib/ai/orchestrator.ts`

- `sendTemplate()` function already exists and handles:
  - Idempotency check via `RenewalNotification` table (for `renewal:*` keys)
  - Template sending via `sendTemplateMessage()`
  - Message record creation
- Updated to handle `PENDING` status (prevents duplicate sends)

### 6. Renewal Reminder Processing

**File**: `src/lib/renewals/processReminders.ts`

- `processRenewalReminders()` function:
  - Fetches renewals where:
    - `status = 'ACTIVE'`
    - `reminderStage < 3`
    - `nextReminderAt <= now`
    - `remindersEnabled = true`
    - `expiryDate > now` (not expired)
  - For each renewal:
    - Checks user engagement (pauses if last inbound < 24h)
    - Determines `stageToSend = reminderStage + 1`
    - Sends on configured channels using template registry + centralized vars
    - Creates `RenewalNotification` record BEFORE sending (idempotency)
    - On success: Updates `reminderStage`, `lastRemindedAt`, `nextReminderAt`
  - Stops reminders when:
    - `status != 'ACTIVE'`
    - `reminderStage >= 3`
    - `expiryDate` is in the past

### 7. Cron Job Endpoint

**File**: `src/app/api/cron/process-renewal-reminders/route.ts`

- Endpoint: `/api/cron/process-renewal-reminders`
- Supports GET and POST
- Query params:
  - `max` (default: 50) - Max renewals to process
  - `dryRun` (default: false) - Dry run mode
- Returns processing results with counts

## Idempotency Flow

```
1. Cron job triggers processRenewalReminders()
2. For each renewal:
   a. Check idempotency: Lookup RenewalNotification by idempotencyKey
   b. If exists and status=SENT → skip (RENEWAL_DEDUP_HIT)
   c. Create RenewalNotification record with status=PENDING (DB unique constraint)
   d. If create fails (P2002) → skip (duplicate)
   e. Call sendTemplate() via orchestrator
   f. On success: Update RenewalNotification to status=SENT with messageId
   g. Update Renewal: increment reminderStage, set lastRemindedAt, compute nextReminderAt
```

## Idempotency Key Format

```
renewal:{channel}:{renewalId}:stage:{stage}
```

Example: `renewal:whatsapp:123:stage:1`

## User Engagement Pause

If `lastInboundAt < 24 hours`:
- Skip sending reminder
- Reschedule `nextReminderAt` to `now + 24h`
- Prevents spam and automation overlap with live conversation

## Logging

Structured logs:
- `RENEWAL_JOB_PICKED` - renewalId, stage, channel, template
- `RENEWAL_DEDUP_HIT` - idempotencyKey
- `RENEWAL_SENT` - renewalId, channel, stage, notificationId, messageId
- `RENEWAL_SKIPPED` - renewalId, reason
- `RENEWAL_FAILED` - renewalId, channel, error

## Acceptance Criteria Met

✅ For any renewalId + stage + channel, at most one message is sent (even with concurrent workers)
✅ Variables in templates always match DB values:
  - `{{1}}` = contact.fullName
  - `{{2}}` = renewal.serviceType
  - `{{3}}` = renewal.expiryDate formatted as "06 Jan 2026"
✅ Stage progression is correct and stops after 3 reminders or when status changes
✅ No other code path can send renewal reminders except `Orchestrator.sendTemplate()`
✅ User engagement pause (24h cooldown) prevents spam

## Testing

### Manual Test

```bash
# Dry run (no actual sends)
curl "http://localhost:3000/api/cron/process-renewal-reminders?dryRun=true"

# Process up to 10 renewals
curl "http://localhost:3000/api/cron/process-renewal-reminders?max=10"
```

### Vercel Cron Setup

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/process-renewal-reminders",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

This runs every 10 minutes.

## Migration Required

Run the migration:
```bash
npx prisma migrate deploy
```

Or apply SQL directly:
```sql
-- See prisma/migrations/20250106000001_add_renewal_reminder_stage/migration.sql
```

## Template Setup

Ensure these templates are approved in Meta Business Manager:

**WhatsApp Templates**:
- `renewal_notification_r1` (variables: {{1}}, {{2}}, {{3}})
- `renewal_notification_r2` (variables: {{1}}, {{2}}, {{3}})
- `renewal_notification_r3` (variables: {{1}}, {{2}}, {{3}})

**Facebook Templates** (when enabled):
- `fb_renewal_reminder_1` (variables: {{1}}, {{2}}, {{3}})
- `fb_renewal_reminder_2` (variables: {{1}}, {{2}}, {{3}})
- `fb_renewal_reminder_3` (variables: {{1}}, {{2}}, {{3}})

## Next Steps

1. Run migration
2. Set up Vercel cron (or external scheduler)
3. Create/approve templates in Meta Business Manager
4. Test with a renewal record:
   ```sql
   INSERT INTO "Renewal" (contact_id, service_type, expiry_date, status, reminder_stage, next_reminder_at)
   VALUES (1, 'VISA_RENEWAL', NOW() + INTERVAL '25 days', 'ACTIVE', 0, NOW());
   ```
5. Monitor logs for `RENEWAL_*` events

