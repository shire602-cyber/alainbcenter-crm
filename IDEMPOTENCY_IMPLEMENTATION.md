# WhatsApp Autopilot Idempotency & Flow State Implementation

## Overview
This document describes the implementation of hard idempotency and conversation flow state management to prevent duplicate AI replies and repeated questions.

## Problem Statement
WhatsApp AI was repeating the same question multiple times (e.g., "What type of UAE visa do you currently hold?" sent 2-3 times) due to:
- Meta webhook duplicate deliveries/retries
- No idempotency check on inbound messages
- Conversation flow step not persisted
- Autopilot triggered multiple times per inbound message (race conditions)
- Slow webhook response causing Meta retries

## Solution Architecture

### 1. Inbound Message Idempotency (Hard Dedupe)
**Table**: `InboundMessageDedup`
- **Fields**: `id`, `provider`, `providerMessageId` (unique), `conversationId`, `receivedAt`, `processedAt`, `processingStatus`, `error`
- **Logic**: 
  - Extract `providerMessageId` from WhatsApp webhook: `entry[].changes[].value.messages[0].id`
  - On webhook receipt: attempt insert with unique `providerMessageId`
  - If unique violation: immediately return 200 OK and DO NOT reply
  - Else: continue processing in background
- **Location**: `src/lib/webhook/idempotency.ts` → `checkInboundIdempotency()`

### 2. Outbound Reply Idempotency (Hard Dedupe)
**Table**: `OutboundMessageLog`
- **Fields**: `id`, `provider`, `conversationId`, `triggerProviderMessageId`, `outboundTextHash`, `outboundMessageId`, `flowStep`, `lastQuestionKey`, `createdAt`
- **Unique Constraint**: `(provider, triggerProviderMessageId)` - One outbound per inbound message
- **Logic**:
  - Before sending any outbound message: check if already sent for that `triggerProviderMessageId`
  - If yes: skip sending
  - If no: send and log
- **Location**: `src/lib/webhook/idempotency.ts` → `checkOutboundIdempotency()`, `logOutboundMessage()`

### 3. Conversation Flow State Machine (Persisted)
**Fields on `Conversation` table**:
- `flowKey`: string (e.g., "family_visa", "freelance_visa")
- `flowStep`: string (e.g., "WAIT_SPONSOR_VISA_TYPE", "PRICING")
- `lastQuestionKey`: string (e.g., "SPONSOR_VISA_TYPE")
- `lastQuestionAt`: datetime
- `collectedData`: jsonb (sponsorVisaType, familyLocation, dependentsCount, timeline, nationality, etc.)

**Logic**:
- Rule engine reads this state and NEVER asks a question that equals `lastQuestionKey` unless:
  - User did not answer AND at least 3 minutes passed AND we are sending a gentle clarification
- When we ASK a question: set `lastQuestionKey` + `flowStep` = `WAIT_...`
- When user ANSWERS: store answer in `collectedData`, advance to next step
- **Location**: `src/lib/conversation/flowState.ts`

### 4. Webhook Handler Response Time (<1s)
**Implementation**:
- Return 200 OK immediately after validation and dedupe insert
- Continue processing in background using async IIFE (fire-and-forget)
- **Location**: `src/app/api/webhooks/whatsapp/route.ts` lines 462-651

### 5. Prevent Loops
**Implementation**:
- Ignore webhook events that are status updates / echo messages from our own number
- Only process actual inbound customer messages
- **Location**: `src/app/api/webhooks/whatsapp/route.ts` lines 396-409

### 6. Comprehensive Logging
**Inbound Webhook Logs**:
- `providerMessageId`, `contact` phone, `conversationId`, `dedupeHit` true/false
- **Location**: `src/app/api/webhooks/whatsapp/route.ts` lines 430, 493

**Outbound Send Logs**:
- `triggerProviderMessageId`, `outboundMessageId`, `flowStep`, `lastQuestionKey`
- **Location**: `src/lib/autoReply.ts` lines 1187-1199

## Database Schema Changes

### New Tables
1. **InboundMessageDedup**: Hard idempotency for inbound messages
2. **OutboundMessageLog**: Hard idempotency for outbound replies

### Conversation Table Updates
Added fields:
- `flowKey`, `flowStep`, `lastQuestionKey`, `lastQuestionAt`, `collectedData`

## Migration
Run the migration script:
```bash
psql $DATABASE_URL -f prisma/migrations/add_idempotency_tables.sql
```

Or apply via Prisma:
```bash
npx prisma migrate dev --name add_idempotency_tables
```

## Testing Plan

### Test A: Single Message Processing
1. Send "Hi" from WhatsApp once
2. **Expected**: 
   - Only one webhook processed (or multiple but dedupe prevents repeats)
   - Only one outbound message sent
   - Log shows: `dedupeHit: false` for first, `dedupeHit: true` for duplicates

### Test B: Flow State Advancement
1. Send "Hi" → AI asks "What type of UAE visa do you currently hold?"
2. Send "Partner"
3. **Expected**:
   - `flowStep` advances to next step
   - Does NOT ask visa type again
   - `collectedData` contains `sponsorVisaType: 'partner'`

### Test C: Duplicate Webhook Replay
1. Force duplicate webhook replay (simulate calling handler twice with same message id)
2. **Expected**:
   - 200 OK with `dedupeHit: true`
   - No outbound send
   - Log shows duplicate detected

### Test D: Conversation Thread Uniqueness
1. Send message from same contact
2. **Expected**:
   - Same contact maps to same conversation reliably
   - Unique constraint on `(contactId, channel)` prevents duplicates

## Files Modified

1. **prisma/schema.prisma**: Added tables and Conversation fields
2. **src/lib/webhook/idempotency.ts**: NEW - Idempotency handlers
3. **src/lib/conversation/flowState.ts**: NEW - Flow state management
4. **src/app/api/webhooks/whatsapp/route.ts**: Idempotency check, fast response, background processing
5. **src/lib/autoReply.ts**: Outbound idempotency check, flow state logging
6. **src/lib/ai/ruleEngine.ts**: Flow state persistence, question deduplication

## Verification

Run test script:
```bash
npx tsx scripts/test-idempotency.ts
```

Check logs for:
- `[IDEMPOTENCY]` - Inbound dedupe hits
- `[OUTBOUND-LOG]` - Outbound message logs
- `[FLOW-STATE]` - Flow state updates
- `[WEBHOOK-LOG]` - Webhook processing logs

## Guarantees

✅ **For any inbound WhatsApp message, the system generates at most ONE outbound AI reply**
✅ **Never repeats the same question if it was already asked (unless 3+ minutes passed)**
✅ **Webhook responds <1s to prevent Meta retries**
✅ **Works across serverless instances (database-level dedupe, not in-memory)**

