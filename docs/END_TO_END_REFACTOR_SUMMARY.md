# End-to-End Refactor Summary

## Overview
This document summarizes the complete refactoring to enforce a single AI brain and canonical conversation identity.

## Files Changed/Deleted

### Deleted Files
- `src/lib/aiReply.ts` - DELETED (replaced by orchestrator)

### Refactored Files (Now Route to Orchestrator)
- `src/lib/aiMessaging.ts` - Thin wrapper around orchestrator
- `src/lib/aiMessageGeneration.ts` - Routes to orchestrator
- `src/lib/autoReply.ts` - Core AI generation replaced with orchestrator call
- `src/app/api/webhooks/whatsapp/route.ts` - Uses orchestrator instead of replyEngine

### New Files Created
- `src/lib/ai/orchestrator.ts` - SINGLE SOURCE OF TRUTH for AI
- `src/lib/conversation/upsert.ts` - SINGLE SOURCE OF TRUTH for conversation creation
- `src/lib/conversation/getExternalThreadId.ts` - Canonical external thread ID extraction
- `src/lib/inbound/serviceMapping.ts` - Centralized service mapping

### Schema Changes
- Added index: `@@index([channel, contactId, externalThreadId])` to Conversation model
- Migration: `20250128000002_add_conversation_external_thread_index`

## Call Chain: Inbound WhatsApp → Lead Update → AI Orchestrator → Outbound Send

```
1. Webhook receives message
   └─> src/app/api/webhooks/whatsapp/route.ts

2. Auto-match pipeline processes inbound
   └─> src/lib/inbound/autoMatchPipeline.ts
       ├─> Dedupe check (providerMessageId)
       ├─> Upsert contact (normalized phone)
       ├─> Find/create lead (smart rules)
       ├─> Upsert conversation (canonical identity)
       │   └─> src/lib/conversation/upsert.ts
       │       └─> Uses getExternalThreadId() for WhatsApp waId
       ├─> Create message record
       ├─> Extract fields (service, nationality, expiry)
       │   └─> src/lib/inbound/fieldExtractors.ts
       ├─> Map service to Lead fields
       │   └─> src/lib/inbound/serviceMapping.ts
       └─> Update Lead immediately (serviceTypeEnum, serviceTypeId, requestedServiceRaw)

3. Webhook triggers AI reply
   └─> src/app/api/webhooks/whatsapp/route.ts
       └─> Calls orchestrator
           └─> src/lib/ai/orchestrator.ts
               ├─> Loads AI Rules from ruleEngine.ts
               ├─> Loads AI Training Documents from DB
               ├─> Builds system prompt
               ├─> Tries rule engine first (deterministic)
               ├─> Falls back to LLM if needed
               ├─> Validates with strictQualification
               ├─> Checks for duplicate outbound (10-min window)
               └─> Returns structured output

4. Webhook sends outbound message
   └─> src/app/api/webhooks/whatsapp/route.ts
       ├─> Calls sendTextMessage()
       ├─> Creates outbound message record
       │   └─> Uses SAME conversationId as inbound
       └─> Updates conversation (lastOutboundAt, lastMessageAt)
```

## Proof: Only ONE LLM Caller

Run this grep to verify:
```bash
grep -r "generateCompletion\|chat.completions\|groq\|deepseek\|openai" src/lib --include="*.ts" | grep -v "orchestrator\|llm/providers\|llm/routing\|llm/index"
```

Expected result: Only orchestrator and LLM infrastructure files should appear.

## Remaining Work

### High Priority
1. ✅ Delete/refactor old AI files - DONE
2. ✅ Update webhook to use orchestrator - DONE
3. ⏳ Enforce canonical conversation identity everywhere (outbound sends)
4. ⏳ Implement fail-proof dedupe (DB transactions + stateVersion)
5. ⏳ Implement strict state machine (max 5 questions)
6. ⏳ Ensure lead auto-fill visible in UI
7. ⏳ Add comprehensive tests
8. ⏳ Add Reset AI admin tool

### Implementation Status

#### ✅ Completed
- Orchestrator created and working
- Old AI files refactored to route to orchestrator
- Webhook updated to use orchestrator
- Conversation upsert function created
- External thread ID extraction function created
- Service mapping function created
- Outbound deduplication guard (10-min window) in orchestrator

#### ⏳ In Progress
- Enforcing canonical conversation identity in all outbound sends
- Implementing DB-level idempotency with stateVersion
- Implementing strict state machine for max 5 questions
- Adding UI debug panel for lead auto-fill
- Writing comprehensive tests
- Creating Reset AI admin tool

## Next Steps

1. Update all outbound send functions to use `upsertConversation()` before sending
2. Add `stateVersion` field to Conversation model for optimistic concurrency
3. Implement strict question state machine in orchestrator
4. Add debug panel to Lead detail page
5. Write integration tests
6. Create admin UI for Reset AI


