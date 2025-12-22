# AI Autorespond & Auto-Qualify Implementation

## Overview

This document describes the implementation of AI-powered autorespond and auto-qualify functionality for inbound WhatsApp messages (and future channels).

## Architecture

### Flow Diagram

```
WhatsApp Inbound Message
    ↓
Webhook Handler (/api/webhooks/whatsapp)
    ↓
Store Message in Database
    ↓
Trigger Automation Engine (non-blocking)
    ↓
Load INBOUND_MESSAGE Rules
    ↓
Evaluate Conditions (channel, stage, keywords, cooldown)
    ↓
Execute Actions:
    - REQUALIFY_LEAD (update aiScore/aiNotes)
    - SEND_AI_REPLY (generate + send AI message)
    ↓
Log Results in AutomationRunLog
```

## Components

### 1. Automation Engine Extensions

**File**: `src/lib/automation/engine.ts`

- Added `INBOUND_MESSAGE` trigger support in `evaluateConditions()`
- Enhanced `checkCooldown()` to support both `cooldownDays` and `cooldownMinutes`
- Condition evaluation supports:
  - `channels`: Array of allowed channels (e.g., `['WHATSAPP']`)
  - `matchStages`: Array of pipeline stages (e.g., `['NEW', 'CONTACTED']`)
  - `onlyHot`: Require `aiScore >= 70`
  - `containsAny`: Keyword matching (case-insensitive)
  - `workingHoursOnly`: Only trigger during 9-18 Dubai time
  - `cooldownMinutes`: Per-lead cooldown period

### 2. AI Messaging Helper

**File**: `src/lib/aiMessaging.ts`

- `generateAIAutoresponse()`: Generates AI reply text using existing `/api/ai/draft-reply` endpoint
- Supports modes: `FOLLOW_UP`, `QUALIFY`, `RENEWAL`, `GENERIC`, `PRICING`
- Automatically truncates to WhatsApp limits (1000 chars)
- Returns structured result with success/error handling

### 3. Automation Actions

**File**: `src/lib/automation/actions.ts`

**New Actions**:
- `SEND_AI_REPLY`: Generates and sends AI-powered reply via WhatsApp/Email
- `REQUALIFY_LEAD`: Re-computes `aiScore` and `aiNotes` based on conversation

**Implementation Details**:
- `executeSendAIReply()`: Calls `generateAIAutoresponse()`, sends via `sendTextMessage()`, creates Message record
- `executeRequalifyLead()`: Calls `requalifyLeadFromConversation()` to update lead scoring

### 4. AI Qualification Extension

**File**: `src/lib/aiQualification.ts`

- `requalifyLeadFromConversation()`: Re-qualifies lead based on:
  - Recent message activity (inbound/outbound counts)
  - Keyword analysis (hot/warm/cold signals)
  - Service-specific keywords
  - Response time metrics
  - Expiry urgency
  - Updates `aiScore` (0-100) and `aiNotes` in database

### 5. Inbound Automation Handler

**File**: `src/lib/automation/inbound.ts`

- `runInboundAutomationsForMessage()`: Main entry point for inbound message automation
- Loads lead with all relations
- Finds active `INBOUND_MESSAGE` rules
- Builds context with `triggerData.lastMessage`
- Runs each rule (non-blocking, error-safe)
- Logs results

### 6. Webhook Integration

**File**: `src/app/api/webhooks/whatsapp/route.ts`

- After storing inbound message, triggers automation in background
- Uses dynamic import to avoid blocking webhook response
- Errors are logged but don't affect webhook response (always returns 200)

### 7. Default Rules Seed

**File**: `src/scripts/seed-automation-rules.ts`

**Default Rules**:
1. **New WhatsApp Enquiry** (`new_whatsapp_welcome`)
   - Trigger: `INBOUND_MESSAGE`
   - Conditions: `channels=['WHATSAPP']`, `matchStages=['NEW']`, `cooldownMinutes=60`
   - Actions: `REQUALIFY_LEAD`, `SEND_AI_REPLY` (mode: `QUALIFY`)

2. **Price Inquiry Response** (`existing_lead_pricing`)
   - Trigger: `INBOUND_MESSAGE`
   - Conditions: `channels=['WHATSAPP']`, `matchStages=['CONTACTED','ENGAGED','QUALIFIED']`, `containsAny=['price','how much','cost','fees']`, `cooldownMinutes=120`
   - Actions: `SEND_AI_REPLY` (mode: `PRICING`)

3. **Renewal Detection** (`renewal_keyword_detection`)
   - Trigger: `INBOUND_MESSAGE`
   - Conditions: `channels=['WHATSAPP']`, `containsAny=['renew','renewal','extend','expired','expiring']`, `cooldownMinutes=1440`
   - Actions: `SEND_AI_REPLY` (mode: `RENEWAL`), `SET_NEXT_FOLLOWUP` (1 day)

4. **Hot Lead Instant Reply** (`hot_lead_instant_reply`)
   - Trigger: `INBOUND_MESSAGE`
   - Conditions: `channels=['WHATSAPP']`, `onlyHot=true`, `cooldownMinutes=30`
   - Actions: `REQUALIFY_LEAD`, `SEND_AI_REPLY` (mode: `FOLLOW_UP`)

**API Endpoint**: `POST /api/admin/automation/seed-inbound` (Admin only)

## Usage

### Seeding Default Rules

```bash
# Via API (requires admin auth)
curl -X POST http://localhost:3000/api/admin/automation/seed-inbound \
  -H "Cookie: session=..."

# Or via script
npx tsx src/scripts/seed-automation-rules.ts
```

### Creating Custom Rules

Via Admin UI or API:

```json
{
  "name": "Custom Welcome Rule",
  "key": "custom_welcome",
  "trigger": "INBOUND_MESSAGE",
  "conditions": {
    "channels": ["WHATSAPP"],
    "matchStages": ["NEW"],
    "cooldownMinutes": 60
  },
  "actions": [
    {
      "type": "SEND_AI_REPLY",
      "channel": "WHATSAPP",
      "mode": "QUALIFY"
    }
  ],
  "isActive": true,
  "enabled": true
}
```

## Safety & Guardrails

1. **Cooldown Protection**: Rules respect `cooldownMinutes` to prevent spam
2. **Autopilot Toggle**: Leads with `autopilotEnabled=false` skip all automation
3. **Error Handling**: Automation errors don't break webhook (always returns 200)
4. **AI Failure Handling**: If AI generation fails, no message is sent (logged as ERROR)
5. **Message Length Limits**: WhatsApp messages truncated to 1000 chars
6. **Working Hours**: Optional `workingHoursOnly` condition for business hours only

## Extension Points

### Future Channels

To add email/Instagram/Facebook support:

1. Update `AIMessageContext.channel` type
2. Add channel-specific send logic in `executeSendAIReply()`
3. Update webhook handlers to call `runInboundAutomationsForMessage()`

### Future Actions

To add new action types:

1. Add case in `executeAction()` in `src/lib/automation/actions.ts`
2. Implement executor function (e.g., `executeNewAction()`)
3. Update seed rules if needed

## Testing

### Manual Testing

1. Send WhatsApp message to test number
2. Check AutomationRunLog for rule execution
3. Verify Message record created with `direction='OUTBOUND'`
4. Verify `aiScore` and `aiNotes` updated if `REQUALIFY_LEAD` action used

### Monitoring

- Check `/api/automation/logs` for automation execution history
- Monitor webhook logs for errors
- Review `AutomationRunLog` table for success/failure rates

## Notes

- AI messages are helpers, not replacements - always sent under your WhatsApp number
- Manual AI draft buttons still work independently
- Rules can be enabled/disabled per lead via `autopilotEnabled` field
- All automation is logged in `AutomationRunLog` for audit trail




# AI Autorespond & Auto-Qualify Implementation

## Overview

This document describes the implementation of AI-powered autorespond and auto-qualify functionality for inbound WhatsApp messages (and future channels).

## Architecture

### Flow Diagram

```
WhatsApp Inbound Message
    ↓
Webhook Handler (/api/webhooks/whatsapp)
    ↓
Store Message in Database
    ↓
Trigger Automation Engine (non-blocking)
    ↓
Load INBOUND_MESSAGE Rules
    ↓
Evaluate Conditions (channel, stage, keywords, cooldown)
    ↓
Execute Actions:
    - REQUALIFY_LEAD (update aiScore/aiNotes)
    - SEND_AI_REPLY (generate + send AI message)
    ↓
Log Results in AutomationRunLog
```

## Components

### 1. Automation Engine Extensions

**File**: `src/lib/automation/engine.ts`

- Added `INBOUND_MESSAGE` trigger support in `evaluateConditions()`
- Enhanced `checkCooldown()` to support both `cooldownDays` and `cooldownMinutes`
- Condition evaluation supports:
  - `channels`: Array of allowed channels (e.g., `['WHATSAPP']`)
  - `matchStages`: Array of pipeline stages (e.g., `['NEW', 'CONTACTED']`)
  - `onlyHot`: Require `aiScore >= 70`
  - `containsAny`: Keyword matching (case-insensitive)
  - `workingHoursOnly`: Only trigger during 9-18 Dubai time
  - `cooldownMinutes`: Per-lead cooldown period

### 2. AI Messaging Helper

**File**: `src/lib/aiMessaging.ts`

- `generateAIAutoresponse()`: Generates AI reply text using existing `/api/ai/draft-reply` endpoint
- Supports modes: `FOLLOW_UP`, `QUALIFY`, `RENEWAL`, `GENERIC`, `PRICING`
- Automatically truncates to WhatsApp limits (1000 chars)
- Returns structured result with success/error handling

### 3. Automation Actions

**File**: `src/lib/automation/actions.ts`

**New Actions**:
- `SEND_AI_REPLY`: Generates and sends AI-powered reply via WhatsApp/Email
- `REQUALIFY_LEAD`: Re-computes `aiScore` and `aiNotes` based on conversation

**Implementation Details**:
- `executeSendAIReply()`: Calls `generateAIAutoresponse()`, sends via `sendTextMessage()`, creates Message record
- `executeRequalifyLead()`: Calls `requalifyLeadFromConversation()` to update lead scoring

### 4. AI Qualification Extension

**File**: `src/lib/aiQualification.ts`

- `requalifyLeadFromConversation()`: Re-qualifies lead based on:
  - Recent message activity (inbound/outbound counts)
  - Keyword analysis (hot/warm/cold signals)
  - Service-specific keywords
  - Response time metrics
  - Expiry urgency
  - Updates `aiScore` (0-100) and `aiNotes` in database

### 5. Inbound Automation Handler

**File**: `src/lib/automation/inbound.ts`

- `runInboundAutomationsForMessage()`: Main entry point for inbound message automation
- Loads lead with all relations
- Finds active `INBOUND_MESSAGE` rules
- Builds context with `triggerData.lastMessage`
- Runs each rule (non-blocking, error-safe)
- Logs results

### 6. Webhook Integration

**File**: `src/app/api/webhooks/whatsapp/route.ts`

- After storing inbound message, triggers automation in background
- Uses dynamic import to avoid blocking webhook response
- Errors are logged but don't affect webhook response (always returns 200)

### 7. Default Rules Seed

**File**: `src/scripts/seed-automation-rules.ts`

**Default Rules**:
1. **New WhatsApp Enquiry** (`new_whatsapp_welcome`)
   - Trigger: `INBOUND_MESSAGE`
   - Conditions: `channels=['WHATSAPP']`, `matchStages=['NEW']`, `cooldownMinutes=60`
   - Actions: `REQUALIFY_LEAD`, `SEND_AI_REPLY` (mode: `QUALIFY`)

2. **Price Inquiry Response** (`existing_lead_pricing`)
   - Trigger: `INBOUND_MESSAGE`
   - Conditions: `channels=['WHATSAPP']`, `matchStages=['CONTACTED','ENGAGED','QUALIFIED']`, `containsAny=['price','how much','cost','fees']`, `cooldownMinutes=120`
   - Actions: `SEND_AI_REPLY` (mode: `PRICING`)

3. **Renewal Detection** (`renewal_keyword_detection`)
   - Trigger: `INBOUND_MESSAGE`
   - Conditions: `channels=['WHATSAPP']`, `containsAny=['renew','renewal','extend','expired','expiring']`, `cooldownMinutes=1440`
   - Actions: `SEND_AI_REPLY` (mode: `RENEWAL`), `SET_NEXT_FOLLOWUP` (1 day)

4. **Hot Lead Instant Reply** (`hot_lead_instant_reply`)
   - Trigger: `INBOUND_MESSAGE`
   - Conditions: `channels=['WHATSAPP']`, `onlyHot=true`, `cooldownMinutes=30`
   - Actions: `REQUALIFY_LEAD`, `SEND_AI_REPLY` (mode: `FOLLOW_UP`)

**API Endpoint**: `POST /api/admin/automation/seed-inbound` (Admin only)

## Usage

### Seeding Default Rules

```bash
# Via API (requires admin auth)
curl -X POST http://localhost:3000/api/admin/automation/seed-inbound \
  -H "Cookie: session=..."

# Or via script
npx tsx src/scripts/seed-automation-rules.ts
```

### Creating Custom Rules

Via Admin UI or API:

```json
{
  "name": "Custom Welcome Rule",
  "key": "custom_welcome",
  "trigger": "INBOUND_MESSAGE",
  "conditions": {
    "channels": ["WHATSAPP"],
    "matchStages": ["NEW"],
    "cooldownMinutes": 60
  },
  "actions": [
    {
      "type": "SEND_AI_REPLY",
      "channel": "WHATSAPP",
      "mode": "QUALIFY"
    }
  ],
  "isActive": true,
  "enabled": true
}
```

## Safety & Guardrails

1. **Cooldown Protection**: Rules respect `cooldownMinutes` to prevent spam
2. **Autopilot Toggle**: Leads with `autopilotEnabled=false` skip all automation
3. **Error Handling**: Automation errors don't break webhook (always returns 200)
4. **AI Failure Handling**: If AI generation fails, no message is sent (logged as ERROR)
5. **Message Length Limits**: WhatsApp messages truncated to 1000 chars
6. **Working Hours**: Optional `workingHoursOnly` condition for business hours only

## Extension Points

### Future Channels

To add email/Instagram/Facebook support:

1. Update `AIMessageContext.channel` type
2. Add channel-specific send logic in `executeSendAIReply()`
3. Update webhook handlers to call `runInboundAutomationsForMessage()`

### Future Actions

To add new action types:

1. Add case in `executeAction()` in `src/lib/automation/actions.ts`
2. Implement executor function (e.g., `executeNewAction()`)
3. Update seed rules if needed

## Testing

### Manual Testing

1. Send WhatsApp message to test number
2. Check AutomationRunLog for rule execution
3. Verify Message record created with `direction='OUTBOUND'`
4. Verify `aiScore` and `aiNotes` updated if `REQUALIFY_LEAD` action used

### Monitoring

- Check `/api/automation/logs` for automation execution history
- Monitor webhook logs for errors
- Review `AutomationRunLog` table for success/failure rates

## Notes

- AI messages are helpers, not replacements - always sent under your WhatsApp number
- Manual AI draft buttons still work independently
- Rules can be enabled/disabled per lead via `autopilotEnabled` field
- All automation is logged in `AutomationRunLog` for audit trail
















