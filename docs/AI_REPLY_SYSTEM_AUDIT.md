# WhatsApp AI Auto-Reply System Audit Report
**Date:** 2025-01-28  
**Auditor:** Senior TypeScript/Next.js Engineer  
**Scope:** Fail-proof AI reply system implementation verification

---

## 1) SYSTEM MAP (Call Paths)

### A) Webhook Inbound → Auto Reply → Generate Reply → Send

```
POST /api/webhooks/whatsapp
  ↓
handleInboundMessageAutoMatch() [src/lib/inbound/autoMatchPipeline.ts:58]
  ↓ (creates contact, conversation, lead, message)
  ↓
generateAIReply() [src/lib/ai/orchestrator.ts:185]
  ↓ (OR generateReply() [src/lib/replyEngine/index.ts:28] - NOT USED IN WEBHOOK)
  ↓
sendOutboundWithIdempotency() [src/lib/outbound/sendWithIdempotency.ts:73]
  ↓
sendTextMessage() [src/lib/whatsapp.ts:81]
  ↓
fetch() to Meta Graph API [src/lib/whatsapp.ts:124]
```

**Evidence:**
- `src/app/api/webhooks/whatsapp/route.ts:476` → `handleInboundMessageAutoMatch()`
- `src/app/api/webhooks/whatsapp/route.ts:545` → `generateAIReply()` (orchestrator)
- `src/app/api/webhooks/whatsapp/route.ts:598` → `sendOutboundWithIdempotency()`

### B) Manual AI Reply Endpoint (leads/[id]/ai-reply)

```
GET /api/leads/[id]/ai-reply
  ↓
generateAIReply() [src/lib/ai/orchestrator.ts:185]
  ↓
Returns replyText (NO SEND - client must call send endpoint)
```

**Evidence:**
- `src/app/api/leads/[id]/ai-reply/route.ts:60` → `generateAIReply()`
- **NO SEND** - This endpoint only generates, does not send

### C) Draft Reply Endpoint (ai/draft-reply)

```
POST /api/ai/draft-reply
  ↓
retrieveAndGuard() [src/lib/ai/retrieverChain.ts:31]
  ↓ (if canRespond: false, returns error)
  ↓
generateDraftReply() [src/lib/ai/generate.ts]
  ↓
Returns draftText (NO SEND - saves to AIDraft table)
```

**Evidence:**
- `src/app/api/ai/draft-reply/route.ts:189` → `retrieveAndGuard()`
- `src/app/api/ai/draft-reply/route.ts:256` → `generateDraftReply()`
- **NO SEND** - This endpoint only generates drafts

### D) Admin/Debug Actions That Can Send Messages

**VIOLATION #1:** `POST /api/admin/auto-reply/test` [src/app/api/admin/auto-reply/test/route.ts:139]
- **Calls:** `sendTextMessage()` directly (bypasses idempotency)
- **File:** `src/app/api/admin/auto-reply/test/route.ts:139`
- **Status:** ⚠️ **VIOLATION** - Does NOT use `sendOutboundWithIdempotency()`

**VIOLATION #2:** `POST /api/inbox/conversations/[id]/reply` [src/app/api/inbox/conversations/[id]/reply/route.ts:107]
- **Calls:** `sendTextMessage()` directly (bypasses idempotency)
- **File:** `src/app/api/inbox/conversations/[id]/reply/route.ts:107`
- **Status:** ⚠️ **VIOLATION** - Does NOT use `sendOutboundWithIdempotency()`

**VIOLATION #3:** `POST /api/inbox/conversations/[id]/messages` [src/app/api/inbox/conversations/[id]/messages/route.ts:204]
- **Calls:** `sendTextMessage()` directly (bypasses idempotency)
- **File:** `src/app/api/inbox/conversations/[id]/messages/route.ts:204`
- **Status:** ⚠️ **VIOLATION** - Does NOT use `sendOutboundWithIdempotency()`

**VIOLATION #4:** `POST /api/leads/[id]/send-message` [src/app/api/leads/[id]/send-message/route.ts:118]
- **Calls:** `fetch()` directly to Meta Graph API (bypasses idempotency)
- **File:** `src/app/api/leads/[id]/send-message/route.ts:118`
- **Status:** ⚠️ **VIOLATION** - Does NOT use `sendOutboundWithIdempotency()`

**VIOLATION #5:** `POST /api/leads/[id]/messages/send` [src/app/api/leads/[id]/messages/send/route.ts:133]
- **Calls:** `sendWhatsAppMessage()` from `whatsappClient.ts` (bypasses idempotency)
- **File:** `src/app/api/leads/[id]/messages/send/route.ts:133`
- **Status:** ⚠️ **VIOLATION** - Does NOT use `sendOutboundWithIdempotency()`

**VIOLATION #6:** Multiple automation/followup endpoints
- `src/lib/automation/actions.ts:133` → `sendWhatsAppMessage()` (bypasses idempotency)
- `src/lib/followups/engine.ts:165` → `sendTextMessage()` (bypasses idempotency)
- `src/app/api/leads/[id]/send-followup/route.ts:113` → `sendTextMessage()` (bypasses idempotency)
- `src/app/api/cron/run-reminders/route.ts:143` → `sendTextMessage()` (bypasses idempotency)
- `src/lib/inbound/staffReminders.ts:99` → `sendTextMessage()` (bypasses idempotency)

---

## 2) "SINGLE SENDER" PROOF

### ✅ CORRECT: Webhook Handler Uses Idempotency
- **File:** `src/app/api/webhooks/whatsapp/route.ts:598`
- **Function:** `sendOutboundWithIdempotency()`
- **Status:** ✅ **CORRECT**

### ❌ VIOLATIONS: Direct Sending (Bypasses Idempotency)

| File | Line | Function Called | Status |
|------|------|----------------|--------|
| `src/app/api/admin/auto-reply/test/route.ts` | 139 | `sendTextMessage()` | ❌ **VIOLATION** |
| `src/app/api/inbox/conversations/[id]/reply/route.ts` | 107 | `sendTextMessage()` | ❌ **VIOLATION** |
| `src/app/api/inbox/conversations/[id]/messages/route.ts` | 204 | `sendTextMessage()` | ❌ **VIOLATION** |
| `src/app/api/leads/[id]/send-message/route.ts` | 118 | `fetch()` (direct API) | ❌ **VIOLATION** |
| `src/app/api/leads/[id]/messages/send/route.ts` | 133 | `sendWhatsAppMessage()` | ❌ **VIOLATION** |
| `src/lib/automation/actions.ts` | 133, 595 | `sendWhatsAppMessage()`, `sendTextMessage()` | ❌ **VIOLATION** |
| `src/lib/followups/engine.ts` | 165 | `sendTextMessage()` | ❌ **VIOLATION** |
| `src/app/api/leads/[id]/send-followup/route.ts` | 113 | `sendTextMessage()` | ❌ **VIOLATION** |
| `src/app/api/cron/run-reminders/route.ts` | 143 | `sendTextMessage()` | ❌ **VIOLATION** |
| `src/lib/inbound/staffReminders.ts` | 99 | `sendTextMessage()` | ❌ **VIOLATION** |

**Conclusion:** ❌ **REQUIREMENT NOT MET** - Multiple endpoints bypass `sendOutboundWithIdempotency()`

---

## 3) IDEMPOTENCY PROOF

### ✅ OutboundDedupeKey Generation
- **File:** `src/lib/outbound/sendWithIdempotency.ts:44`
- **Function:** `computeOutboundDedupeKey()`
- **Composition:**
  ```typescript
  hash(conversationId + replyType + normalizedQuestionKey + dayBucket OR inboundMessageId)
  ```
- **Evidence:** Lines 45-67

### ✅ UNIQUE Constraint in Schema
- **File:** `prisma/schema.prisma:817`
- **Field:** `outboundDedupeKey String? @unique`
- **Migration:** `prisma/migrations/20251228140026_fix_outbound_dedupe_nullable/migration.sql`
- **Index:** Partial unique index `WHERE "outboundDedupeKey" IS NOT NULL`
- **Status:** ✅ **VERIFIED**

### ✅ Transaction Safety
- **File:** `src/lib/outbound/sendWithIdempotency.ts:87-100`
- **Process:**
  1. Insert `OutboundMessageLog` with `status="PENDING"` (UNIQUE constraint)
  2. If insert fails (P2002) → return early (duplicate blocked)
  3. If insert succeeds → send WhatsApp message
  4. Update log to `status="SENT"` or `status="FAILED"`
- **Status:** ✅ **VERIFIED** - Safe under concurrency

### ✅ Webhook Retry Simulation
- **File:** `src/app/api/admin/conversations/[id]/simulate-retry/route.ts:51`
- **Calls:** `handleInboundMessageAutoMatch()` (same path as webhook)
- **Status:** ✅ **VERIFIED** - Uses same pipeline

---

## 4) FIRST MESSAGE BEHAVIOR PROOF

### ✅ First Message Detection
- **File:** `src/lib/replyEngine/index.ts:98-104`
- **Logic:**
  ```typescript
  const outboundCount = await prisma.message.count({
    where: { conversationId, direction: 'OUTBOUND' }
  })
  const isFirstMessage = outboundCount === 0
  ```
- **Status:** ✅ **VERIFIED**

### ✅ First Message Bypasses Retriever/Training
- **File:** `src/lib/replyEngine/index.ts:142-191`
- **Logic:** If `isFirstMessage === true`, sends greeting immediately
- **Evidence:** Lines 142-191 show greeting sent without retriever check
- **Status:** ✅ **VERIFIED** - First message bypasses retriever

### ⚠️ ORCHESTRATOR FIRST MESSAGE HANDLING
- **File:** `src/lib/ai/orchestrator.ts:272-273`
- **Logic:**
  ```typescript
  const outboundCount = conversation.messages.filter(m => m.direction === 'OUTBOUND').length
  const isFirstMessage = outboundCount === 0
  ```
- **Issue:** Orchestrator does NOT bypass retriever for first message
- **Status:** ⚠️ **POTENTIAL GAP** - Orchestrator may check retriever even for first message

**Evidence:** `src/lib/ai/orchestrator.ts:269-291` - No explicit first-message bypass in orchestrator

---

## 5) FOLLOW-UP BEHAVIOR PROOF

### ✅ Retriever/Training Check for Non-First Messages
- **File:** `src/lib/autoReply.ts:662-675`
- **Logic:**
  ```typescript
  if (!isFirstMessage) {
    retrievalResult = await retrieveAndGuard(messageText, {...})
    if (!retrievalResult.canRespond) {
      // Mark lead requires human
    }
  }
  ```
- **Status:** ✅ **VERIFIED** - Only checks retriever for non-first messages

### ⚠️ Draft Reply Endpoint Always Checks Retriever
- **File:** `src/app/api/ai/draft-reply/route.ts:189`
- **Logic:** Always calls `retrieveAndGuard()` regardless of first message
- **Status:** ⚠️ **POTENTIAL GAP** - Draft endpoint may block first messages if no training

### ✅ Policy: Reply Anyway vs Escalate
- **File:** `src/lib/autoReply.ts:675-680`
- **Logic:** If retriever fails, creates task but does NOT block reply (policy allows reply anyway)
- **Evidence:** Lines 675-680 show task creation but no blocking
- **Status:** ✅ **VERIFIED** - Matches intended policy (reply anyway, create task)

---

## 6) LEAD WIPE PREVENTION PROOF

### ✅ Guard: Only Update If updateData Has Keys
- **File:** `src/lib/inbound/autoMatchPipeline.ts:398-419`
- **Logic:**
  ```typescript
  if (Object.keys(updateData).length > 0) {
    await prisma.lead.update({ where: { id: lead.id }, data: updateData })
  } else {
    console.log(`⚠️ No fields extracted - skipping lead update to prevent wiping existing data`)
  }
  ```
- **Status:** ✅ **VERIFIED** - Guard prevents wiping

### ✅ Extracted Fields Persisted to conversation.knownFields
- **File:** `src/lib/inbound/autoMatchPipeline.ts:186-208`
- **Logic:**
  ```typescript
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { knownFields: JSON.stringify(updatedKnownFields) }
  })
  ```
- **Status:** ✅ **VERIFIED** - Fields persisted for audit

### ✅ Extraction Failure Cannot Wipe Existing Fields
- **File:** `src/lib/inbound/autoMatchPipeline.ts:210-214`
- **Logic:** If extraction throws, `extractedFields = {}`, so `updateData` remains empty
- **Status:** ✅ **VERIFIED** - Extraction failure = no update = no wipe

---

## 7) STATE MACHINE SAFETY PROOF

### ✅ questionsAskedCount Increment Logic
- **File:** `src/lib/conversation/flowState.ts:126-162`
- **Logic:**
  ```typescript
  const questionKeyChanged = current?.lastQuestionKey !== questionKey
  if (questionKeyChanged && !justAsked) {
    const newCount = (current?.questionsAskedCount || 0) + 1
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { questionsAskedCount: newCount }
    })
  }
  ```
- **Status:** ✅ **VERIFIED** - Only increments when `lastQuestionKey` changes

### ✅ lastQuestionKey Stored After Each Question
- **File:** `src/lib/conversation/flowState.ts:158-161`
- **Logic:**
  ```typescript
  await updateFlowState(conversationId, {
    lastQuestionKey: questionKey,
    flowStep: flowStep || `WAIT_${questionKey}`
  })
  ```
- **Status:** ✅ **VERIFIED** - Stored atomically with increment

---

## 8) SERVICE TYPE MAPPING PROOF

### ✅ serviceTypeEnum Always Set When Detected
- **File:** `src/lib/inbound/autoMatchPipeline.ts:344-383`
- **Logic:**
  ```typescript
  if (extractedFields.service) {
    updateData.serviceTypeEnum = extractedFields.service
    // Try to match ServiceType
    if (serviceType) {
      updateData.serviceTypeId = serviceType.id
    }
    // serviceTypeEnum is always set even if serviceTypeId is null
  }
  ```
- **Status:** ✅ **VERIFIED** - Enum always set when detected

### ✅ UI Shows Enum Label Even When serviceTypeId Is Null
- **File:** `src/app/leads/[id]/LeadDetailPagePremium.tsx:862-884`
- **Logic:**
  ```typescript
  if (lead.serviceTypeEnum && serviceTypes) {
    const matched = serviceTypes.find(st => st.key?.toLowerCase() === lead.serviceTypeEnum?.toLowerCase())
    return matched?.id.toString() || ''
  }
  // Also displays: "Detected: {serviceTypeEnum}" if serviceTypeId is null
  ```
- **Evidence:** Lines 881-884 show enum label displayed even without serviceTypeId
- **Status:** ✅ **VERIFIED** - UI shows enum label

---

## 9) GAPS & FIXES

### ❌ CRITICAL GAP #1: Multiple Endpoints Bypass Idempotency

**Requirement Violated:** "Single Sender" - All outbound sends must use `sendOutboundWithIdempotency()`

**Evidence:**
- 10+ endpoints call `sendTextMessage()`, `sendWhatsAppMessage()`, or `fetch()` directly
- See Section 2 for full list

**Proposed Patch:**
```typescript
// Replace all direct sends with:
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'

// Example fix for src/app/api/inbox/conversations/[id]/reply/route.ts:107
const sendResult = await sendOutboundWithIdempotency({
  conversationId: conversation.id,
  contactId: conversation.contactId,
  leadId: conversation.leadId,
  phone: conversation.contact.phone,
  text: text.trim(),
  provider: 'whatsapp',
  triggerProviderMessageId: null, // Manual send
  replyType: 'answer',
  lastQuestionKey: null,
  flowStep: null,
})
```

**Files to Fix:**
1. `src/app/api/admin/auto-reply/test/route.ts:139`
2. `src/app/api/inbox/conversations/[id]/reply/route.ts:107`
3. `src/app/api/inbox/conversations/[id]/messages/route.ts:204`
4. `src/app/api/leads/[id]/send-message/route.ts:118` (use idempotency wrapper)
5. `src/app/api/leads/[id]/messages/send/route.ts:133`
6. `src/lib/automation/actions.ts:133, 595`
7. `src/lib/followups/engine.ts:165`
8. `src/app/api/leads/[id]/send-followup/route.ts:113`
9. `src/app/api/cron/run-reminders/route.ts:143`
10. `src/lib/inbound/staffReminders.ts:99`

### ⚠️ GAP #2: Orchestrator May Check Retriever for First Message

**Requirement Violated:** "First inbound message ALWAYS gets an AI reply (no retriever/training gating)"

**Evidence:**
- `src/lib/ai/orchestrator.ts:269-291` - No explicit first-message bypass
- Orchestrator is called from webhook: `src/app/api/webhooks/whatsapp/route.ts:545`

**Proposed Patch:**
```typescript
// In src/lib/ai/orchestrator.ts, add first-message bypass:
const isFirstMessage = outboundCount === 0

if (isFirstMessage) {
  // Bypass retriever for first message - always reply
  // Skip retrieveAndGuard check
  // Proceed directly to reply generation
}
```

### ⚠️ GAP #3: Draft Reply Endpoint Always Checks Retriever

**Requirement Violated:** "First inbound message ALWAYS gets an AI reply (no retriever/training gating)"

**Evidence:**
- `src/app/api/ai/draft-reply/route.ts:189` - Always calls `retrieveAndGuard()`

**Proposed Patch:**
```typescript
// In src/app/api/ai/draft-reply/route.ts, add first-message check:
const isFirstMessage = !resolvedConversationId || 
  (await prisma.message.count({
    where: { conversationId: resolvedConversationId, direction: 'OUTBOUND' }
  })) === 0

if (!isFirstMessage) {
  const retrievalResult = await retrieveAndGuard(userQuery, {...})
  if (!retrievalResult.canRespond) {
    // Handle as before
  }
}
```

---

## SUMMARY

### ✅ VERIFIED REQUIREMENTS
1. ✅ Outbound idempotency implementation (webhook handler)
2. ✅ Lead wipe prevention guard
3. ✅ State machine safety (questionsAskedCount increments only when lastQuestionKey changes)
4. ✅ Service type mapping (enum always set, UI shows label)
5. ✅ First message bypass in replyEngine (greeting sent immediately)
6. ✅ Follow-up retriever check (only for non-first messages)
7. ✅ Policy: Reply anyway if retriever fails (creates task, doesn't block)

### ❌ CRITICAL GAPS
1. ❌ **10+ endpoints bypass idempotency** - Manual/admin sends can create duplicates
2. ⚠️ **Orchestrator may check retriever for first message** - Potential blocking
3. ⚠️ **Draft reply endpoint always checks retriever** - May block first messages

### RECOMMENDATIONS
1. **URGENT:** Replace all direct `sendTextMessage()` calls with `sendOutboundWithIdempotency()`
2. **HIGH:** Add first-message bypass to orchestrator
3. **MEDIUM:** Add first-message check to draft reply endpoint

---

**Audit Complete**  
**Next Steps:** Fix critical gaps before production deployment


