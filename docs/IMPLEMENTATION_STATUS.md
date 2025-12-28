# Implementation Status - Single AI Brain + Canonical Conversations

## ✅ COMPLETED

### 1. Single AI Brain (Orchestrator)
- ✅ Created `src/lib/ai/orchestrator.ts` - ONLY LLM caller
- ✅ Deleted `src/lib/aiReply.ts`
- ✅ Refactored `src/lib/aiMessaging.ts` - thin wrapper around orchestrator
- ✅ Refactored `src/lib/aiMessageGeneration.ts` - routes to orchestrator
- ✅ Refactored `src/lib/autoReply.ts` - core AI generation replaced with orchestrator
- ✅ Updated `src/app/api/webhooks/whatsapp/route.ts` - uses orchestrator

### 2. Canonical Conversation Identity
- ✅ Created `src/lib/conversation/upsert.ts` - single source of truth
- ✅ Created `src/lib/conversation/getExternalThreadId.ts` - canonical extraction
- ✅ Updated `src/lib/inbound/autoMatchPipeline.ts` - uses upsertConversation
- ✅ Added schema index: `@@index([channel, contactId, externalThreadId])`

### 3. Lead Auto-Fill
- ✅ Service mapping function created: `src/lib/inbound/serviceMapping.ts`
- ✅ Auto-fill already implemented in `autoMatchPipeline.ts`
- ✅ Extracts and updates: serviceTypeEnum, serviceTypeId, requestedServiceRaw, nationality, expiry

### 4. Outbound Deduplication
- ✅ 10-minute hash deduplication guard in orchestrator
- ✅ Checks for duplicate outbound messages before sending

## ⏳ REMAINING WORK

### High Priority (Must Complete)

#### 1. Enforce Canonical Conversation Identity in ALL Outbound Sends
**Files to Update:**
- `src/lib/automation/actions.ts` - Use `upsertConversation()` before creating message
- `src/app/api/inbox/conversations/[id]/reply/route.ts` - Use `upsertConversation()`
- `src/app/api/leads/[id]/messages/send/route.ts` - Use `upsertConversation()`
- `src/app/api/leads/[id]/send-message/route.ts` - Use `upsertConversation()`
- `src/lib/messaging.ts` - Use `upsertConversation()`
- `src/lib/followups/engine.ts` - Use `upsertConversation()`
- `src/lib/inbound/staffReminders.ts` - Use `upsertConversation()`

**Pattern to Apply:**
```typescript
import { upsertConversation } from '@/lib/conversation/upsert'
import { getExternalThreadId } from '@/lib/conversation/getExternalThreadId'

// Before creating outbound message:
const { id: conversationId } = await upsertConversation({
  contactId,
  channel: 'whatsapp',
  leadId,
  externalThreadId: getExternalThreadId('whatsapp', contact, webhookPayload),
  timestamp: new Date(),
})

// Then create message with this conversationId
```

#### 2. Implement Fail-Proof Dedupe (DB Transactions + StateVersion)
**Schema Changes Needed:**
```prisma
model Conversation {
  // ... existing fields ...
  stateVersion Int @default(0) // Optimistic concurrency control
  lastAssistantMessageAt DateTime? // Last AI-generated message timestamp
  lastQuestionKey String? // Last question asked (prevent repeats)
  lastNextStepKey String? // Last step in conversation flow
}
```

**Implementation:**
- Add `stateVersion` field to Conversation
- In orchestrator, use `FOR UPDATE` lock when generating reply
- Increment `stateVersion` after generating reply
- Check `stateVersion` before sending

#### 3. Implement Strict State Machine (Max 5 Questions)
**Add to Conversation Model:**
```prisma
model Conversation {
  // ... existing fields ...
  qualificationStage String? // 'GREETING' | 'COLLECTING_NAME' | 'COLLECTING_SERVICE' | 'COLLECTING_DETAILS' | 'READY_FOR_QUOTE'
  questionsAskedCount Int @default(0) // Track total questions asked
  knownFields String? // JSON: { name, service, nationality, expiry, businessActivity, etc. }
}
```

**Implementation in Orchestrator:**
- Load qualification state from conversation
- Enforce max 5 questions for business setup
- Track `lastQuestionKey` to prevent repeats
- Update state after each question

#### 4. Ensure Lead Auto-Fill Visible in UI
**Update Lead Detail Page:**
- Verify UI reads `serviceTypeEnum`, `serviceTypeId`, `requestedServiceRaw`
- Add debug panel (dev-only) showing:
  - `extractedFields`
  - `qualificationStage`
  - `lastQuestionKey`
  - `questionsAskedCount`

#### 5. Add Comprehensive Tests
**Test Files to Create:**
- `src/lib/ai/orchestrator.test.ts` - Test orchestrator logic
- `src/lib/conversation/upsert.test.ts` - Test conversation deduplication
- `src/lib/inbound/autoMatchPipeline.integration.test.ts` - Test full pipeline
- `src/lib/inbound/serviceMapping.test.ts` - Test service mapping

**Test Cases:**
1. Inbound+outbound → ONE conversation
2. Webhook idempotency (same providerMessageId twice)
3. Outbound idempotency (concurrent orchestrator calls)
4. Lead auto-fill (service, nationality, expiry)
5. No repeated questions
6. Business setup max 5 questions

#### 6. Add Reset AI Admin Tool
**Create:**
- `src/app/api/admin/ai/reset/route.ts` - API endpoint
- Button in `/admin/ai-training` page
- Deletes old training documents and seeds default

## Verification Commands

### Verify Only ONE LLM Caller
   ```bash
grep -r "generateCompletion\|chat.completions" src/lib --include="*.ts" | grep -v "orchestrator\|llm/providers\|llm/routing\|llm/index\|orchestrator"
   ```
**Expected:** No results (orchestrator is the only caller)

### Verify All Conversations Use Upsert
   ```bash
grep -r "conversation\.create\|conversation\.upsert" src --include="*.ts" | grep -v "upsertConversation\|findOrCreateConversation"
```
**Expected:** Only `upsertConversation()` calls should appear

### Verify No Direct AI Calls
   ```bash
grep -r "generateAIAutoresponse\|generateAiReply\|handleInboundAutoReply" src --include="*.ts" | grep -v "orchestrator\|aiMessaging\.ts:.*wrapper"
```
**Expected:** Only wrapper functions should appear

## Migration Required

```sql
-- Add stateVersion and qualification fields
ALTER TABLE "Conversation" 
ADD COLUMN IF NOT EXISTS "stateVersion" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastAssistantMessageAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "qualificationStage" TEXT,
ADD COLUMN IF NOT EXISTS "questionsAskedCount" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "knownFields" TEXT;
```

Run: `npx prisma migrate dev --name add_conversation_state_fields`

## Next Immediate Steps

1. **Update all outbound send functions** to use `upsertConversation()`
2. **Add stateVersion field** to Conversation model
3. **Implement strict state machine** in orchestrator
4. **Add UI debug panel** to Lead detail page
5. **Write integration tests**
6. **Create Reset AI admin tool**

## Estimated Time to Complete

- Enforce canonical identity: 2-3 hours (update ~10 files)
- Fail-proof dedupe: 1-2 hours (add stateVersion, implement locking)
- Strict state machine: 2-3 hours (add fields, implement logic)
- UI debug panel: 1 hour
- Tests: 3-4 hours
- Reset AI tool: 1 hour

**Total: ~10-14 hours**
