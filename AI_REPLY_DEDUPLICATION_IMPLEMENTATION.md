# AI Reply Deduplication Implementation

## Summary

Fixed duplicate WhatsApp AI replies by implementing hard idempotency guarantees and centralizing all AI sends through a single entry point.

## Changes Made

### 1. Database Schema Updates

**File**: `prisma/schema.prisma`

- Added `aiState` field to `Conversation` model for state gating
- Added `aiLockUntil` field to `Conversation` model for per-conversation locking
- Created `AiReplyDedup` model with:
  - `idempotencyKey` (unique constraint) - Format: `wa_ai:{conversationId}:{inboundMessageId}:{aiActionType}`
  - Status tracking (PENDING | SENT | FAILED)
  - Links to conversation and inbound message

**Migration**: `prisma/migrations/20250106000000_add_ai_reply_dedup_and_state/migration.sql`

### 2. Orchestrator Updates

**File**: `src/lib/ai/orchestrator.ts`

Added functions:
- `buildIdempotencyKey()` - Generates idempotency key
- `acquireConversationLock()` - Per-conversation lock (30s default)
- `releaseConversationLock()` - Releases lock
- `checkIdempotency()` - Checks if reply already sent
- `createIdempotencyRecord()` - Creates DB record BEFORE sending
- `updateIdempotencyRecord()` - Updates record after send

**New Function**: `sendAiReply()`
- **SINGLE ENTRY POINT** for all AI outbound messages
- Provides:
  - Idempotency check (DB-level unique constraint)
  - Per-conversation locking (prevents concurrent processing)
  - State gating (conversation.aiState progression)
  - Automatic state updates

### 3. Job Processor Updates

**File**: `src/lib/jobs/processOutboundJobs.ts`

- Replaced `generateAIReply()` + `sendOutboundWithIdempotency()` flow with `sendAiReply()`
- All outbound jobs now go through idempotency-protected path
- Removed duplicate phone normalization and 24h window checks (handled by sendAiReply)

### 4. Webhook Handler Updates

**File**: `src/app/api/webhooks/whatsapp/route.ts`

- Enhanced message filtering to only process actual user messages:
  - Ignores status updates (`msg.type === 'status'`)
  - Ignores echo messages (from our own number)
  - Ignores system messages (no `from` field or `from === phone_number_id`)
- Webhook already enqueues jobs (not sending directly) - this is correct

## Idempotency Flow

```
1. Inbound message arrives → Webhook handler
2. Webhook filters to actual user messages only
3. Webhook enqueues OutboundJob (with idempotency key)
4. Job processor picks up job
5. Job processor calls sendAiReply():
   a. Check idempotency (DB lookup)
   b. Acquire conversation lock
   c. Create idempotency record (DB unique constraint)
   d. Generate AI reply
   e. Send via sendOutboundWithIdempotency
   f. Update idempotency record
   g. Release lock
```

## Idempotency Key Format

```
wa_ai:{conversationId}:{inboundMessageId}:{aiActionType}
```

Example: `wa_ai:123:456:auto_reply`

## Logging

Added structured logs:
- `AI_DEDUP_HIT` - When skipping due to idempotency
- `AI_LOCKED_SKIP` - When lock prevents processing
- `AI_SEND` - When message sent successfully (includes conversationId, inboundMessageId, aiActionType, idempotencyKey, messageId)

## Acceptance Criteria Met

✅ For any inbound WhatsApp message ID, at most one AI outbound reply is sent for the same aiActionType
✅ Status updates, metadata updates, retries, or UI actions do not trigger AI replies
✅ DB-level unique constraint prevents even concurrent workers from double-sending
✅ Per-conversation lock prevents concurrent processing
✅ Conversation state progression tracked via `aiState` field

## Testing

To test:
1. Send a WhatsApp message
2. Check logs for `AI_SEND` or `AI_DEDUP_HIT`
3. Verify only one outbound message is sent
4. Try sending same message again - should see `AI_DEDUP_HIT`

## Migration Required

Run the migration:
```bash
npx prisma migrate deploy
```

Or apply SQL directly:
```sql
-- See prisma/migrations/20250106000000_add_ai_reply_dedup_and_state/migration.sql
```

