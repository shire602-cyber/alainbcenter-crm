# Renewal Revenue Engine

## Overview

The Renewal Revenue Engine transforms expiry tracking into a revenue-generating pipeline by:
- Computing renewal probability scores
- Projecting renewal revenue
- Automating renewal outreach
- Providing a dedicated renewals dashboard

## Data Model

### ExpiryItem Model
- `type`: String (VISA_EXPIRY, EMIRATES_ID_EXPIRY, TRADE_LICENSE_EXPIRY, etc.)
- `expiryDate`: DateTime
- `renewalStatus`: PENDING | IN_PROGRESS | RENEWED | NOT_RENEWING
- `renewalLeadId`: Links to renewal Lead when signed

### Lead Model - Renewal Fields
- `estimatedRenewalValue`: String? (Decimal stored as string for SQLite)
- `renewalProbability`: Int? (0-100)
- `renewalNotes`: String? (AI-generated renewal insights)

## Renewal Scoring

**File**: `src/lib/renewalScoring.ts`

### Heuristics (Deterministic)

The `computeRenewalScore()` function uses these factors:

1. **Current Stage** (Won/Existing > Qualified > Engaged > New)
   - COMPLETED_WON: +30
   - QUALIFIED: +20
   - ENGAGED: +15
   - CONTACTED: +10
   - NEW: +5
   - LOST: -20

2. **Source** (referral/returning vs cold)
   - Existing client (isRenewal): +25
   - Referral: +15
   - Direct inquiry: +5

3. **Expiry Proximity** (15-90 days = optimal)
   - 15-90 days: +20
   - <15 days: +15
   - >90 days: +5
   - Expired <30 days: +10
   - Expired >30 days: -10

4. **Recent Activity**
   - >5 messages in last 30 days: +15
   - Some activity: +5
   - No activity: -10

5. **Negative Sentiment**
   - Keywords detected (cancel, refund, not renewing): -20

6. **AI Score**
   - >=70: +10
   - <40: -10

7. **Service Type**
   - Business setup: +10
   - Visa: +5

8. **Assigned Agent**
   - Has assigned user: +5

9. **Renewal Status**
   - IN_PROGRESS: +30
   - NOT_RENEWING: capped at 20%

Final probability is clamped to 0-100.

### Recalculation

`recalcLeadRenewalScore(leadId)` is called:
- After expiry items are created/updated
- After stage changes to WON
- After strong renewal conversations
- Optionally in daily cron for all leads with upcoming expiries

## Lead Detail UI

### Expiry Tracker Card
- Shows all expiry items with:
  - Type badge
  - Expiry date
  - Days remaining (color-coded)
  - Quick actions (add task, draft renewal message)

### Renewal Revenue Card
- **Estimated Renewal Amount**: Inline editable
- **Renewal Probability**: Gauge with color coding (green ≥75%, amber 40-74%, red <40%)
- **Projected Revenue**: `estimatedRenewalValue × (renewalProbability / 100)`
- **Actions**:
  - Draft Renewal WhatsApp (AI-generated)
  - Create Renewal Task
  - Mark Renewal Won
  - Mark Renewal Lost (with reason)

## Renewals Dashboard

**Route**: `/renewals` (ADMIN/MANAGER only)

### Summary Cards
- Expiring in ≤30 days
- Expiring in 31-90 days
- Overdue renewals
- Projected renewal revenue (next 90 days)
- Renewal conversion rate

### Table Columns
- Lead name (clickable)
- Service type
- Expiry type & date
- Days remaining
- **Estimated renewal amount**
- **Renewal probability**
- **Projected revenue**
- Stage
- Owner/assigned user

### Filters
- Expiry type (VISA/EID/LICENSE/etc.)
- Days remaining bucket (0-14, 15-30, 31-90, >90)
- Stage
- Owner

## Automation Rules

**File**: `src/scripts/seed-renewal-automation-rules.ts`

### Default Rules

1. **90-Day Soft Reminder**
   - Trigger: `EXPIRY_WINDOW` (daysBefore: 90)
   - Actions:
     - SEND_AI_REPLY (mode: RENEWAL)
     - CREATE_TASK (RENEWAL_OUTREACH)
     - SET_NEXT_FOLLOWUP (7 days)

2. **30-Day Strong Reminder**
   - Trigger: `EXPIRY_WINDOW` (daysBefore: 30)
   - Actions:
     - SEND_AI_REPLY (mode: RENEWAL, more urgent)
     - CREATE_TASK (RENEWAL_OUTREACH, urgent)
     - SET_NEXT_FOLLOWUP (3 days)

3. **Overdue Escalation**
   - Trigger: `EXPIRY_WINDOW` (daysBefore: -1)
   - Actions:
     - SEND_AI_REPLY (mode: RENEWAL, expired messaging)
     - CREATE_TASK (RENEWAL_INTERNAL, manager review)
     - SET_PRIORITY (URGENT)

### Seeding Rules

```bash
# Via API (requires admin auth)
curl -X POST http://localhost:3000/api/admin/automation/seed-renewal \
  -H "Cookie: session=..."

# Or via script
npx tsx src/scripts/seed-renewal-automation-rules.ts
```

## API Endpoints

### Update Renewal Value
```
POST /api/leads/[id]/renewal
Body: { action: 'update_value', estimatedRenewalValue: '5000' }
```

### Mark Renewal Won
```
POST /api/leads/[id]/renewal
Body: { action: 'mark_won', estimatedRenewalValue: '5000' }
```

### Mark Renewal Lost
```
POST /api/leads/[id]/renewal
Body: { action: 'mark_lost', reason: 'Moved to other provider' }
```

### Get Renewals Dashboard Data
```
GET /api/renewals
Returns: { expiryItems, kpis: { expiring90Days, expiring30Days, expiredNotRenewed, projectedRevenue, renewalConversionRate } }
```

## Safety & Guardrails

1. **AI Renewal Messages**:
   - MUST NOT promise guaranteed approvals
   - Use wording like "we can assist", "we can help you process"
   - Avoid "100% guaranteed"

2. **Autopilot Toggle**:
   - If `lead.autopilotEnabled = false`, automation should not auto-send renewal WhatsApps
   - Only create tasks/logs

3. **Cooldown Protection**:
   - Rules respect cooldown periods to prevent spam
   - AutomationRunLog ensures rules don't fire multiple times for the same stage

## Projected Revenue Calculation

```
Projected Revenue = estimatedRenewalValue × (renewalProbability / 100)
```

Example:
- Estimated value: 5,000 AED
- Probability: 75%
- Projected revenue: 3,750 AED

## Notes

- Renewal scores are deterministic (heuristic-based) with optional AI enhancement for insights
- All renewal actions are logged in lead notes and AutomationRunLog
- The system respects existing expiry tracking and doesn't break current functionality
- Renewal probability is recalculated automatically when relevant data changes



# Renewal Revenue Engine

## Overview

The Renewal Revenue Engine transforms expiry tracking into a revenue-generating pipeline by:
- Computing renewal probability scores
- Projecting renewal revenue
- Automating renewal outreach
- Providing a dedicated renewals dashboard

## Data Model

### ExpiryItem Model
- `type`: String (VISA_EXPIRY, EMIRATES_ID_EXPIRY, TRADE_LICENSE_EXPIRY, etc.)
- `expiryDate`: DateTime
- `renewalStatus`: PENDING | IN_PROGRESS | RENEWED | NOT_RENEWING
- `renewalLeadId`: Links to renewal Lead when signed

### Lead Model - Renewal Fields
- `estimatedRenewalValue`: String? (Decimal stored as string for SQLite)
- `renewalProbability`: Int? (0-100)
- `renewalNotes`: String? (AI-generated renewal insights)

## Renewal Scoring

**File**: `src/lib/renewalScoring.ts`

### Heuristics (Deterministic)

The `computeRenewalScore()` function uses these factors:

1. **Current Stage** (Won/Existing > Qualified > Engaged > New)
   - COMPLETED_WON: +30
   - QUALIFIED: +20
   - ENGAGED: +15
   - CONTACTED: +10
   - NEW: +5
   - LOST: -20

2. **Source** (referral/returning vs cold)
   - Existing client (isRenewal): +25
   - Referral: +15
   - Direct inquiry: +5

3. **Expiry Proximity** (15-90 days = optimal)
   - 15-90 days: +20
   - <15 days: +15
   - >90 days: +5
   - Expired <30 days: +10
   - Expired >30 days: -10

4. **Recent Activity**
   - >5 messages in last 30 days: +15
   - Some activity: +5
   - No activity: -10

5. **Negative Sentiment**
   - Keywords detected (cancel, refund, not renewing): -20

6. **AI Score**
   - >=70: +10
   - <40: -10

7. **Service Type**
   - Business setup: +10
   - Visa: +5

8. **Assigned Agent**
   - Has assigned user: +5

9. **Renewal Status**
   - IN_PROGRESS: +30
   - NOT_RENEWING: capped at 20%

Final probability is clamped to 0-100.

### Recalculation

`recalcLeadRenewalScore(leadId)` is called:
- After expiry items are created/updated
- After stage changes to WON
- After strong renewal conversations
- Optionally in daily cron for all leads with upcoming expiries

## Lead Detail UI

### Expiry Tracker Card
- Shows all expiry items with:
  - Type badge
  - Expiry date
  - Days remaining (color-coded)
  - Quick actions (add task, draft renewal message)

### Renewal Revenue Card
- **Estimated Renewal Amount**: Inline editable
- **Renewal Probability**: Gauge with color coding (green ≥75%, amber 40-74%, red <40%)
- **Projected Revenue**: `estimatedRenewalValue × (renewalProbability / 100)`
- **Actions**:
  - Draft Renewal WhatsApp (AI-generated)
  - Create Renewal Task
  - Mark Renewal Won
  - Mark Renewal Lost (with reason)

## Renewals Dashboard

**Route**: `/renewals` (ADMIN/MANAGER only)

### Summary Cards
- Expiring in ≤30 days
- Expiring in 31-90 days
- Overdue renewals
- Projected renewal revenue (next 90 days)
- Renewal conversion rate

### Table Columns
- Lead name (clickable)
- Service type
- Expiry type & date
- Days remaining
- **Estimated renewal amount**
- **Renewal probability**
- **Projected revenue**
- Stage
- Owner/assigned user

### Filters
- Expiry type (VISA/EID/LICENSE/etc.)
- Days remaining bucket (0-14, 15-30, 31-90, >90)
- Stage
- Owner

## Automation Rules

**File**: `src/scripts/seed-renewal-automation-rules.ts`

### Default Rules

1. **90-Day Soft Reminder**
   - Trigger: `EXPIRY_WINDOW` (daysBefore: 90)
   - Actions:
     - SEND_AI_REPLY (mode: RENEWAL)
     - CREATE_TASK (RENEWAL_OUTREACH)
     - SET_NEXT_FOLLOWUP (7 days)

2. **30-Day Strong Reminder**
   - Trigger: `EXPIRY_WINDOW` (daysBefore: 30)
   - Actions:
     - SEND_AI_REPLY (mode: RENEWAL, more urgent)
     - CREATE_TASK (RENEWAL_OUTREACH, urgent)
     - SET_NEXT_FOLLOWUP (3 days)

3. **Overdue Escalation**
   - Trigger: `EXPIRY_WINDOW` (daysBefore: -1)
   - Actions:
     - SEND_AI_REPLY (mode: RENEWAL, expired messaging)
     - CREATE_TASK (RENEWAL_INTERNAL, manager review)
     - SET_PRIORITY (URGENT)

### Seeding Rules

```bash
# Via API (requires admin auth)
curl -X POST http://localhost:3000/api/admin/automation/seed-renewal \
  -H "Cookie: session=..."

# Or via script
npx tsx src/scripts/seed-renewal-automation-rules.ts
```

## API Endpoints

### Update Renewal Value
```
POST /api/leads/[id]/renewal
Body: { action: 'update_value', estimatedRenewalValue: '5000' }
```

### Mark Renewal Won
```
POST /api/leads/[id]/renewal
Body: { action: 'mark_won', estimatedRenewalValue: '5000' }
```

### Mark Renewal Lost
```
POST /api/leads/[id]/renewal
Body: { action: 'mark_lost', reason: 'Moved to other provider' }
```

### Get Renewals Dashboard Data
```
GET /api/renewals
Returns: { expiryItems, kpis: { expiring90Days, expiring30Days, expiredNotRenewed, projectedRevenue, renewalConversionRate } }
```

## Safety & Guardrails

1. **AI Renewal Messages**:
   - MUST NOT promise guaranteed approvals
   - Use wording like "we can assist", "we can help you process"
   - Avoid "100% guaranteed"

2. **Autopilot Toggle**:
   - If `lead.autopilotEnabled = false`, automation should not auto-send renewal WhatsApps
   - Only create tasks/logs

3. **Cooldown Protection**:
   - Rules respect cooldown periods to prevent spam
   - AutomationRunLog ensures rules don't fire multiple times for the same stage

## Projected Revenue Calculation

```
Projected Revenue = estimatedRenewalValue × (renewalProbability / 100)
```

Example:
- Estimated value: 5,000 AED
- Probability: 75%
- Projected revenue: 3,750 AED

## Notes

- Renewal scores are deterministic (heuristic-based) with optional AI enhancement for insights
- All renewal actions are logged in lead notes and AutomationRunLog
- The system respects existing expiry tracking and doesn't break current functionality
- Renewal probability is recalculated automatically when relevant data changes















