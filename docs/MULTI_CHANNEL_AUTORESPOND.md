# Multi-Channel AI Autoresponder & Auto-Qualify

## Overview

This document describes the multi-channel AI autoresponder and auto-qualify system that works across WhatsApp, Email, Instagram, Facebook Messenger, and Webchat.

## Architecture

### Unified Inbound Handler

All inbound messages from any channel flow through a single handler: `handleInboundMessage()` in `src/lib/inbound.ts`.

**Flow**:
```
Channel Webhook (WhatsApp/Email/IG/FB/Webchat)
    ↓
Parse Provider-Specific Payload
    ↓
Call handleInboundMessage()
    ↓
Normalize Sender Address
    ↓
Find/Create Contact
    ↓
Find/Create Lead
    ↓
Find/Create Conversation
    ↓
Create Message Record (with idempotency)
    ↓
Trigger Automation Engine (non-blocking)
    ↓
Return { lead, conversation, message }
```

### Channel Support

| Channel | Status | Inbound Route | Outbound Support |
|---------|--------|---------------|------------------|
| WhatsApp | ✅ Complete | `/api/webhooks/whatsapp` | ✅ Full (Meta Cloud API) |
| Email | ✅ Ready | `/api/webhooks/email` | ⚠️ Stub (SMTP TODO) |
| Instagram | ✅ Ready | `/api/webhooks/instagram` | ⚠️ Stub (Meta Graph API TODO) |
| Facebook | ✅ Ready | `/api/webhooks/facebook` | ⚠️ Stub (Meta Graph API TODO) |
| Webchat | ✅ Ready | `/api/webhooks/webchat` | ⚠️ Stub (Chat Widget TODO) |

## Components

### 1. Common Inbound Handler

**File**: `src/lib/inbound.ts`

- `handleInboundMessage()`: Unified handler for all channels
- Normalizes sender addresses per channel:
  - WhatsApp: Phone number (E.164)
  - Email: Lowercase email
  - Instagram/Facebook: User ID or handle
  - Webchat: Email or session ID
- Handles idempotency via `externalMessageId`
- Creates/updates Lead, Contact, Conversation, Message
- Triggers automation automatically

### 2. Channel-Specific Webhooks

All webhooks follow the same pattern:
1. Verify webhook signature (if applicable)
2. Parse provider-specific payload
3. Extract message data (from, body, timestamp, etc.)
4. Call `handleInboundMessage()`
5. Return 200 OK

**Routes**:
- `POST /api/webhooks/whatsapp` - WhatsApp Cloud API
- `POST /api/webhooks/email` - Email providers (SendGrid, Mailgun, etc.)
- `POST /api/webhooks/instagram` - Instagram Direct Messages
- `POST /api/webhooks/facebook` - Facebook Messenger
- `POST /api/webhooks/webchat` - Website chat widget

### 3. Channel-Aware Automation

**File**: `src/lib/automation/inbound.ts`

- `runInboundAutomationsForMessage()`: Filters rules by channel
- Only runs rules where `conditions.channels` includes the message channel
- Prevents duplicate autoresponds (checks for existing outbound messages)
- Respects `autopilotEnabled` per lead

### 4. Multi-Channel AI Reply Action

**File**: `src/lib/automation/actions.ts`

- `executeSendAIReply()`: Supports all channels
- **WhatsApp**: Uses `sendTextMessage()` from `whatsapp.ts`
- **Email**: Uses `sendEmailMessage()` from `emailClient.ts`
- **Instagram/Facebook**: Logs as SKIPPED (adapter TODO)
- **Webchat**: Logs as SKIPPED (adapter TODO)

### 5. Working Hours Guardrail

**File**: `src/lib/automation/engine.ts`

- `workingHoursOnly` condition: Only triggers 9-18 Dubai time, Monday-Friday
- Checks Asia/Dubai timezone
- Returns SKIPPED with reason if outside hours

## Usage

### Creating Channel-Specific Rules

```json
{
  "name": "WhatsApp Welcome",
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
  ]
}
```

### Multi-Channel Rule

```json
{
  "name": "All Channels - Hot Lead Reply",
  "trigger": "INBOUND_MESSAGE",
  "conditions": {
    "channels": ["WHATSAPP", "EMAIL", "INSTAGRAM", "FACEBOOK"],
    "onlyHot": true,
    "workingHoursOnly": false,
    "cooldownMinutes": 30
  },
  "actions": [
    {
      "type": "REQUALIFY_LEAD"
    },
    {
      "type": "SEND_AI_REPLY",
      "channel": "WHATSAPP", // Will use the message's channel
      "mode": "FOLLOW_UP"
    }
  ]
}
```

## Safety Features

1. **Idempotency**: Messages with `externalMessageId` are deduplicated
2. **Cooldown**: Per-rule, per-lead cooldown (minutes or days)
3. **Working Hours**: Optional `workingHoursOnly` condition
4. **Duplicate Prevention**: Checks for existing autoresponses before sending
5. **Autopilot Toggle**: Leads with `autopilotEnabled=false` skip automation
6. **Channel Filtering**: Rules only run for specified channels
7. **Error Handling**: Automation errors don't break webhooks (always return 200)

## Extension Points

### Adding New Channels

1. Add channel to `InboundChannel` type in `src/lib/inbound.ts`
2. Add normalization logic in `handleInboundMessage()`
3. Create webhook route in `src/app/api/webhooks/[channel]/route.ts`
4. Update `SEND_AI_REPLY` action to support the channel
5. Add outbound send helper (if needed)

### Implementing Channel Adapters

For channels marked as "Stub", implement:

1. **Email**: Complete SMTP sending in `src/lib/emailClient.ts`
2. **Instagram/Facebook**: Implement Meta Graph API sending
3. **Webchat**: Implement chat widget API or WebSocket

## Testing

### Test Inbound Messages

```bash
# WhatsApp (via Meta webhook)
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"971501234567","id":"test123","text":{"body":"Hello"}}]}}]}]}'

# Email
curl -X POST http://localhost:3000/api/webhooks/email \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","subject":"Test","text":"Hello"}'

# Webchat
curl -X POST http://localhost:3000/api/webhooks/webchat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","name":"Test User","message":"Hello"}'
```

### Verify Automation

1. Check `AutomationRunLog` for rule execution
2. Check `Message` table for outbound autoresponses
3. Verify `aiScore` and `aiNotes` updated if `REQUALIFY_LEAD` used

## Notes

- All channels use the same automation rules and AI generation
- Channel-specific logic is isolated to webhook parsing and outbound sending
- Existing WhatsApp flows continue to work (backward compatible)
- Manual AI draft buttons work independently of automation
- Rules can be enabled/disabled per channel via `conditions.channels`



# Multi-Channel AI Autoresponder & Auto-Qualify

## Overview

This document describes the multi-channel AI autoresponder and auto-qualify system that works across WhatsApp, Email, Instagram, Facebook Messenger, and Webchat.

## Architecture

### Unified Inbound Handler

All inbound messages from any channel flow through a single handler: `handleInboundMessage()` in `src/lib/inbound.ts`.

**Flow**:
```
Channel Webhook (WhatsApp/Email/IG/FB/Webchat)
    ↓
Parse Provider-Specific Payload
    ↓
Call handleInboundMessage()
    ↓
Normalize Sender Address
    ↓
Find/Create Contact
    ↓
Find/Create Lead
    ↓
Find/Create Conversation
    ↓
Create Message Record (with idempotency)
    ↓
Trigger Automation Engine (non-blocking)
    ↓
Return { lead, conversation, message }
```

### Channel Support

| Channel | Status | Inbound Route | Outbound Support |
|---------|--------|---------------|------------------|
| WhatsApp | ✅ Complete | `/api/webhooks/whatsapp` | ✅ Full (Meta Cloud API) |
| Email | ✅ Ready | `/api/webhooks/email` | ⚠️ Stub (SMTP TODO) |
| Instagram | ✅ Ready | `/api/webhooks/instagram` | ⚠️ Stub (Meta Graph API TODO) |
| Facebook | ✅ Ready | `/api/webhooks/facebook` | ⚠️ Stub (Meta Graph API TODO) |
| Webchat | ✅ Ready | `/api/webhooks/webchat` | ⚠️ Stub (Chat Widget TODO) |

## Components

### 1. Common Inbound Handler

**File**: `src/lib/inbound.ts`

- `handleInboundMessage()`: Unified handler for all channels
- Normalizes sender addresses per channel:
  - WhatsApp: Phone number (E.164)
  - Email: Lowercase email
  - Instagram/Facebook: User ID or handle
  - Webchat: Email or session ID
- Handles idempotency via `externalMessageId`
- Creates/updates Lead, Contact, Conversation, Message
- Triggers automation automatically

### 2. Channel-Specific Webhooks

All webhooks follow the same pattern:
1. Verify webhook signature (if applicable)
2. Parse provider-specific payload
3. Extract message data (from, body, timestamp, etc.)
4. Call `handleInboundMessage()`
5. Return 200 OK

**Routes**:
- `POST /api/webhooks/whatsapp` - WhatsApp Cloud API
- `POST /api/webhooks/email` - Email providers (SendGrid, Mailgun, etc.)
- `POST /api/webhooks/instagram` - Instagram Direct Messages
- `POST /api/webhooks/facebook` - Facebook Messenger
- `POST /api/webhooks/webchat` - Website chat widget

### 3. Channel-Aware Automation

**File**: `src/lib/automation/inbound.ts`

- `runInboundAutomationsForMessage()`: Filters rules by channel
- Only runs rules where `conditions.channels` includes the message channel
- Prevents duplicate autoresponds (checks for existing outbound messages)
- Respects `autopilotEnabled` per lead

### 4. Multi-Channel AI Reply Action

**File**: `src/lib/automation/actions.ts`

- `executeSendAIReply()`: Supports all channels
- **WhatsApp**: Uses `sendTextMessage()` from `whatsapp.ts`
- **Email**: Uses `sendEmailMessage()` from `emailClient.ts`
- **Instagram/Facebook**: Logs as SKIPPED (adapter TODO)
- **Webchat**: Logs as SKIPPED (adapter TODO)

### 5. Working Hours Guardrail

**File**: `src/lib/automation/engine.ts`

- `workingHoursOnly` condition: Only triggers 9-18 Dubai time, Monday-Friday
- Checks Asia/Dubai timezone
- Returns SKIPPED with reason if outside hours

## Usage

### Creating Channel-Specific Rules

```json
{
  "name": "WhatsApp Welcome",
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
  ]
}
```

### Multi-Channel Rule

```json
{
  "name": "All Channels - Hot Lead Reply",
  "trigger": "INBOUND_MESSAGE",
  "conditions": {
    "channels": ["WHATSAPP", "EMAIL", "INSTAGRAM", "FACEBOOK"],
    "onlyHot": true,
    "workingHoursOnly": false,
    "cooldownMinutes": 30
  },
  "actions": [
    {
      "type": "REQUALIFY_LEAD"
    },
    {
      "type": "SEND_AI_REPLY",
      "channel": "WHATSAPP", // Will use the message's channel
      "mode": "FOLLOW_UP"
    }
  ]
}
```

## Safety Features

1. **Idempotency**: Messages with `externalMessageId` are deduplicated
2. **Cooldown**: Per-rule, per-lead cooldown (minutes or days)
3. **Working Hours**: Optional `workingHoursOnly` condition
4. **Duplicate Prevention**: Checks for existing autoresponses before sending
5. **Autopilot Toggle**: Leads with `autopilotEnabled=false` skip automation
6. **Channel Filtering**: Rules only run for specified channels
7. **Error Handling**: Automation errors don't break webhooks (always return 200)

## Extension Points

### Adding New Channels

1. Add channel to `InboundChannel` type in `src/lib/inbound.ts`
2. Add normalization logic in `handleInboundMessage()`
3. Create webhook route in `src/app/api/webhooks/[channel]/route.ts`
4. Update `SEND_AI_REPLY` action to support the channel
5. Add outbound send helper (if needed)

### Implementing Channel Adapters

For channels marked as "Stub", implement:

1. **Email**: Complete SMTP sending in `src/lib/emailClient.ts`
2. **Instagram/Facebook**: Implement Meta Graph API sending
3. **Webchat**: Implement chat widget API or WebSocket

## Testing

### Test Inbound Messages

```bash
# WhatsApp (via Meta webhook)
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"971501234567","id":"test123","text":{"body":"Hello"}}]}}]}]}'

# Email
curl -X POST http://localhost:3000/api/webhooks/email \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","subject":"Test","text":"Hello"}'

# Webchat
curl -X POST http://localhost:3000/api/webhooks/webchat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","name":"Test User","message":"Hello"}'
```

### Verify Automation

1. Check `AutomationRunLog` for rule execution
2. Check `Message` table for outbound autoresponses
3. Verify `aiScore` and `aiNotes` updated if `REQUALIFY_LEAD` used

## Notes

- All channels use the same automation rules and AI generation
- Channel-specific logic is isolated to webhook parsing and outbound sending
- Existing WhatsApp flows continue to work (backward compatible)
- Manual AI draft buttons work independently of automation
- Rules can be enabled/disabled per channel via `conditions.channels`
















