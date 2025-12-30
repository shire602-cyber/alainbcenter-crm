# Critical Fixes Summary - Single AI Brain + Deduplication

## Overview
This document summarizes the critical fixes implemented to:
1. Create a single source of truth for AI replies (orchestrator)
2. Fix duplicate conversations
3. Ensure lead auto-fill works reliably
4. Stop duplicate outbound messages
5. Enforce max 5 questions for business setup

## PART 1 — Single AI Brain (Orchestrator)

### Created: `src/lib/ai/orchestrator.ts`
- **ONLY module allowed to call LLM**
- Loads AI Rules from `ruleEngine.ts` (deterministic)
- Loads AI Training Documents from DB (`AITrainingDocument` table)
- Builds single system prompt from rules + training
- Validates output with `strictQualification.ts`
- Returns structured output: `{ replyText, extractedFields, confidence, nextStepKey, tasksToCreate }`

### Files to Refactor (TODO):
- `src/lib/aiMessaging.ts` → DELETE or make thin wrapper
- `src/lib/aiReply.ts` → DELETE
- `src/lib/aiMessageGeneration.ts` → Refactor to use orchestrator
- `src/lib/autoReply.ts` → Refactor to use orchestrator only
- `src/app/api/webhooks/whatsapp/route.ts` → Use orchestrator instead of replyEngine

### How to Use Orchestrator:
```typescript
import { generateAIReply } from '@/lib/ai/orchestrator'

const result = await generateAIReply({
  conversationId,
  leadId,
  contactId,
  inboundText,
  inboundMessageId,
  channel: 'whatsapp',
  language: 'en',
  agentProfileId: lead.aiAgentProfileId || undefined,
})
```

## PART 2 — Conversation Deduplication

### Created: `src/lib/conversation/upsert.ts`
- **SINGLE SOURCE OF TRUTH** for conversation creation/updates
- Enforces: ONE conversation per (contactId, channel, externalThreadId)
- Uses normalized lowercase channel
- Handles externalThreadId (WhatsApp waId, email thread ID, etc.)

### Schema Update:
- Added index: `@@index([channel, contactId, externalThreadId])`
- Existing constraint: `@@unique([contactId, channel])` (still enforced)

### Usage:
```typescript
import { upsertConversation } from '@/lib/conversation/upsert'

const { id } = await upsertConversation({
  contactId,
  channel: 'whatsapp',
  leadId,
  externalThreadId: contact.waId, // For WhatsApp
  timestamp: new Date(),
})
```

### Updated Files:
- `src/lib/inbound/autoMatchPipeline.ts` → Uses `upsertConversation()`
- All outbound send functions should use `upsertConversation()` before sending

## PART 3 — Lead Auto-Fill

### Created: `src/lib/inbound/serviceMapping.ts`
- Centralized service mapping function
- Maps extracted service to `serviceTypeEnum` and `serviceTypeId`
- Handles "cheapest" keyword → sets `PRICE_SENSITIVE` tag
- Handles "marketing license" → accepts as business activity

### Current Implementation:
- `src/lib/inbound/autoMatchPipeline.ts` already implements lead auto-fill
- Extracts: service, nationality, expiry, counts, businessActivity
- Updates Lead immediately after extraction
- Stores in `lead.dataJson` and direct fields (`serviceTypeEnum`, `serviceTypeId`, `requestedServiceRaw`)

### TODO: Refactor to use centralized mapping:
```typescript
import { mapExtractedServiceToLeadServiceType } from '@/lib/inbound/serviceMapping'

const mapping = await mapExtractedServiceToLeadServiceType(extractedFields.service)
// Use mapping.serviceTypeEnum, mapping.serviceTypeId, mapping.requestedServiceRaw
```

## PART 4 — Outbound Deduplication

### TODO: Implement deduplication guard
Before sending outbound AI message:
1. Compute hash: `sha256(conversationId + normalizedReplyText)`
2. Check if same hash was sent in last 10 minutes
3. If yes → DO NOT send again

### Implementation Location:
- Add to `src/lib/ai/orchestrator.ts` before returning reply
- Store hash in `Conversation.lastAutoReplyKey` or new `OutboundIdempotencyLog` table

## PART 5 — Question State Machine (Max 5 Questions)

### Business Setup Flow (Max 5 Questions):
1. Name
2. Business activity (accept free text, don't force DB)
3. Mainland or Freezone
4. How many partners?
5. How many visas?

Then ask for email/phone only if not already known.

### Implementation:
- Already partially implemented in `src/lib/ai/ruleEngine.ts`
- Track `lastQuestionKey` in `Conversation` model
- Never ask "are you inside UAE" for business setup
- Enforced by `strictQualification.ts` validation

## PART 6 — Tests (TODO)

### Required Tests:
1. Inbound+outbound on same contact → ONE conversation
2. Inbound "I want freelance visa" → Lead.serviceType set immediately
3. AI reply must not exceed 5 questions for business setup
4. AI reply must not repeat same question twice
5. Outbound dedupe: same reply not sent twice within 10 minutes

### Test Files to Create:
- `src/lib/ai/orchestrator.test.ts`
- `src/lib/conversation/upsert.test.ts`
- `src/lib/inbound/serviceMapping.test.ts`
- `src/lib/inbound/autoMatchPipeline.integration.test.ts`

## Migration Required

### Prisma Migration:
```sql
-- Add index for externalThreadId uniqueness
CREATE INDEX IF NOT EXISTS "Conversation_channel_contactId_externalThreadId_idx" 
ON "Conversation" (channel, "contactId", "externalThreadId") 
WHERE "externalThreadId" IS NOT NULL;
```

Run: `npx prisma migrate dev --name add_conversation_external_thread_index`

## Next Steps

1. ✅ Create orchestrator
2. ✅ Create upsertConversation
3. ✅ Update schema
4. ⏳ Refactor all AI calls to use orchestrator
5. ⏳ Add outbound deduplication guard
6. ⏳ Add automated tests
7. ⏳ Update webhook to use orchestrator instead of replyEngine

## Notes

- **AI Prompt Storage**: Stored in `AITrainingDocument` table (admin UI: `/admin/ai-training`)
- **AI Rules**: Stored in `src/lib/ai/ruleEngine.ts` (code-based, deterministic)
- **How to Reset AI Rules**: 
  - Training documents: Delete/recreate in admin UI
  - Rule engine: Update `RULE_ENGINE_JSON` in `ruleEngine.ts` and redeploy


