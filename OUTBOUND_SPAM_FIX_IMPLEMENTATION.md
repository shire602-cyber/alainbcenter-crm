# Outbound Spam Fix - Implementation Summary

## Problem Solved
- **Multi-bubble spam**: AI was sending multiple separate messages (greeting + question + instructions)
- **Duplicate sends**: Webhook replays and job retries caused duplicate outbound messages
- **No rate limiting**: AI could send multiple messages in quick succession

## Solution Implemented

### 1. ONE MESSAGE POLICY ✅
- **Function**: `buildSingleAutoReplyText(parts)` in `src/lib/ai/orchestrator.ts`
- **Behavior**: Combines multiple AI segments into ONE WhatsApp message with line breaks
- **Location**: Applied in `sendAiReply()` before sending (line ~1236)

### 2. Outbound Idempotency + Locks ✅
- **Table**: `OutboundMessageDedup` (new)
  - Fields: `id`, `dedupeKey` (unique), `conversationId`, `inboundProviderMessageId`, `status`, `createdAt`, `sentAt`, `providerMessageId`, `lastError`
  - Key format: `auto:{conversationId}:{inboundProviderMessageId}`
- **Enforcement**: Atomic insert BEFORE sending (line ~1277)
  - If insert fails (unique constraint) → skip send (duplicate detected)
  - DB-level protection prevents duplicates even with concurrent workers

### 3. Conversation-Level Throttling ✅
- **Field**: `Conversation.lastAiOutboundAt` (new)
- **Cooldown**: 90 seconds (configurable, between 60-120s)
- **Enforcement**: Checked in `sendAiReply()` before sending (line ~1206)
  - If `lastAiOutboundAt` < 90s ago → block send
  - Updated after successful send
  - **AI-ONLY**: This cooldown ONLY applies to AI auto-replies via `sendAiReply()`
  - Human-sent messages go through different endpoints and are NOT affected by this cooldown

### 4. Retry Behavior Fixed ✅
- **Job Processor**: `src/lib/jobs/processOutboundJobs.ts`
- **Idempotent Retries**:
  - Check `OutboundMessageDedup` status before processing
  - If status = SENT → mark job as SENT (no-op)
  - If status = PENDING → skip (already processing)
  - Duplicate/cooldown errors → mark job as SENT (prevent retries)
- **Exponential Backoff**: Only for real failures (not duplicates/cooldowns)

### 5. Logging ✅
Structured logs added:
- `AI_OUTBOUND_BLOCKED_DUPLICATE` - Duplicate detected
- `AI_OUTBOUND_BLOCKED_COOLDOWN` - Cooldown active
- `AI_OUTBOUND_SENT` - Message sent successfully

## Files Changed

1. **prisma/schema.prisma**
   - Added `lastAiOutboundAt` to `Conversation`
   - Added `OutboundMessageDedup` model
   - Added relation: `Conversation.outboundMessageDedups`

2. **prisma/migrations/20250107000000_add_outbound_dedup_and_cooldown/migration.sql**
   - Migration SQL for schema changes

3. **src/lib/ai/orchestrator.ts**
   - Updated `buildIdempotencyKey()` to support `inboundProviderMessageId`
   - Added `buildSingleAutoReplyText()` function
   - Updated `sendAiReply()`:
     - Get `inboundProviderMessageId` from inbound message
     - Check `OutboundMessageDedup` before processing
     - Check cooldown (`lastAiOutboundAt`)
     - Combine AI segments into one message
     - Create `OutboundMessageDedup` record before sending
     - Update `lastAiOutboundAt` after successful send
     - Structured logging

4. **src/lib/jobs/processOutboundJobs.ts**
   - Check `OutboundMessageDedup` status before processing job
   - Handle duplicate/cooldown errors gracefully (mark as SENT)
   - Structured logging

## Exact Location of Dedupe + Cooldown Enforcement

**File**: `src/lib/ai/orchestrator.ts`
**Function**: `sendAiReply()`
**Lines**:
- **OutboundMessageDedup check**: ~1148-1170
- **Cooldown check**: ~1172-1188
- **OutboundMessageDedup insert**: ~1277-1300
- **Message combining**: ~1236
- **Update lastAiOutboundAt**: ~1320

## Example Log Output

### Duplicate Webhook Replay
```
[ORCHESTRATOR] sendAiReply ENTRY {"conversationId":123,"inboundMessageId":456,"inboundProviderMessageId":"wamid.ABC123","aiActionType":"auto_reply","idempotencyKey":"auto:123:wamid.ABC123","dedupeKey":"auto:123:wamid.ABC123"}
[ORCHESTRATOR] AI_OUTBOUND_BLOCKED_DUPLICATE conversationId=123 inboundProviderMessageId=wamid.ABC123 dedupeKey=auto:123:wamid.ABC123... (DB constraint)
```

### Cooldown Block
```
[ORCHESTRATOR] sendAiReply ENTRY {"conversationId":123,"inboundMessageId":456,"inboundProviderMessageId":"wamid.ABC123","aiActionType":"auto_reply"}
[ORCHESTRATOR] AI_OUTBOUND_BLOCKED_COOLDOWN conversationId=123 inboundProviderMessageId=wamid.ABC123 remainingSeconds=45
```

### Normal Send
```
[ORCHESTRATOR] sendAiReply ENTRY {"conversationId":123,"inboundMessageId":456,"inboundProviderMessageId":"wamid.ABC123","aiActionType":"auto_reply","dedupeKey":"auto:123:wamid.ABC123"}
[ORCHESTRATOR] AI_OUTBOUND_SENT conversationId=123 inboundProviderMessageId=wamid.ABC123 dedupeKey=auto:123:wamid.ABC123... messageId=wamid.XYZ789
```

### Job Retry (Idempotent)
```
🎯 [JOB-PROCESSOR] sendAiReply start jobId=789 requestId=req_123 conversationId=123 inboundMessageId=456 inboundProviderMessageId=wamid.ABC123
⏭️ [JOB-PROCESSOR] AI_OUTBOUND_BLOCKED_DUPLICATE jobId=789 dedupeKey=auto:123:wamid.ABC123... already SENT (idempotent retry)
```

## Acceptance Criteria ✅

- ✅ **One inbound → One outbound**: `buildSingleAutoReplyText()` ensures single message
- ✅ **Webhook replay protection**: `OutboundMessageDedup` with `inboundProviderMessageId` prevents duplicates
- ✅ **Job retry protection**: Job processor checks `OutboundMessageDedup` status before processing
- ✅ **Structured logging**: All blocks/sends logged with clear prefixes
- ✅ **Manual sends unaffected**: Only AI auto-reply flow is limited (via `sendAiReply()`)

## Testing

To test:
1. Send same webhook payload twice → only one outbound should be sent
2. Send two inbound messages within 90s → second should be blocked by cooldown
3. Retry a job → should detect existing `OutboundMessageDedup` and skip

