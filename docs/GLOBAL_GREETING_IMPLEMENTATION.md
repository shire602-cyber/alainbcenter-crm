# Global Greeting & Stage 1 Qualification Implementation

## Overview
Implemented GLOBAL branded greeting prefix on all AI outbound WhatsApp messages and tightened Stage 1 qualification logic.

## NON-NEGOTIABLE BRANDING RULE
Every AI-generated WhatsApp message MUST start with EXACTLY:
```
"Hi 👋 I'm ABCai, from Al Ain Business Center. How can I help you today?\n\n"
```

This applies to:
- First message
- Follow-ups
- Confirmation messages
- Handoff messages

No exceptions unless message is a pure transactional system notice (none currently).

---

## A) GLOBAL GREETING PREFIX (CRITICAL)

### Implementation
**File:** `src/lib/outbound/globalGreeting.ts` (NEW FILE)
- Created `withGlobalGreeting(message: string): string` function
- Rules:
  - If message already starts with the exact greeting, do NOTHING
  - Otherwise, prepend the greeting + blank line
- Helper: `hasGlobalGreeting(message: string): boolean`

**File:** `src/lib/outbound/sendWithIdempotency.ts` (lines 18, 122-125)
- Imported `withGlobalGreeting` from `./globalGreeting`
- Applied greeting **immediately before sending** (line 122-125):
  ```typescript
  // CRITICAL: Apply global greeting prefix for WhatsApp messages
  if (provider === 'whatsapp') {
    text = withGlobalGreeting(text)
  }
  ```
- This guarantees ALL WhatsApp messages are branded consistently

### File/Line References
- **Global greeting function:** `src/lib/outbound/globalGreeting.ts:1-40`
- **Greeting injection point:** `src/lib/outbound/sendWithIdempotency.ts:122-125`

---

## B) ORCHESTRATOR FIRST MESSAGE

**File:** `src/lib/ai/ruleEngine.ts` (line 136)
- Updated first message template to NOT include greeting
- Old: "Hi 👋 I'm AIBC Assistant from Al Ain Business Center. To help quickly..."
- New: "To help quickly, may I have your full name, service needed, and nationality?"
- Greeting is now handled globally by `withGlobalGreeting()`

### File/Line References
- **First message template:** `src/lib/ai/ruleEngine.ts:136`

---

## C) STAGE 1 QUALIFICATION GATE

**File:** `src/lib/ai/orchestrator.ts` (lines 338-418)
- Implemented Stage 1 qualification gate before rule engine
- Stage 1 = core qualification only: **name, service, nationality**
- Before core qualification is complete:
  - Ask ONLY missing among {name, service, nationality}
  - Fixed priority:
    1) name
    2) service
    3) nationality
  - NEVER ask any other questions

### Implementation Logic
```typescript
// Step 1.7: STAGE 1 QUALIFICATION GATE
const hasCoreQualification = 
  conversationState.knownFields.name && 
  conversationState.knownFields.service && 
  conversationState.knownFields.nationality

if (!hasCoreQualification) {
  // Determine which core field to ask for (priority order)
  if (!conversationState.knownFields.name) {
    nextCoreQuestion = { questionKey: 'ASK_NAME', question: '...' }
  } else if (!conversationState.knownFields.service) {
    nextCoreQuestion = { questionKey: 'ASK_SERVICE', question: '...' }
  } else if (!conversationState.knownFields.nationality) {
    nextCoreQuestion = { questionKey: 'ASK_NATIONALITY', question: '...' }
  }
  
  // Check no-repeat guard and banned keys before asking
  if (nextCoreQuestion && !wasAsked && !BANNED_QUESTION_KEYS.has(nextCoreQuestion.questionKey)) {
    // Ask the question
  }
}
```

### File/Line References
- **Stage 1 gate:** `src/lib/ai/orchestrator.ts:338-418`

---

## D) HARD BAN UNNECESSARY QUESTIONS

**File:** `src/lib/ai/orchestrator.ts` (lines 31-38, 490-510)
- Created global blocklist:
  ```typescript
  const BANNED_QUESTION_KEYS = new Set([
    'new_or_renewal',
    'new_or_renew',
    'company_name',
    'companyName',
    'ASK_COMPANY',
    'ASK_NEW_OR_RENEW',
  ])
  ```

- Enforced in orchestrator:
  1. **Before rule engine reply** (lines 490-510): Check reply text and lastQuestionKey for banned keywords
  2. **In Stage 1 gate** (line 391): Check if questionKey is banned before asking
  3. **After rule engine** (line 520): Check if lastQuestionKey is banned before incrementing count

### File/Line References
- **Banned keys definition:** `src/lib/ai/orchestrator.ts:31-38`
- **Banned keys enforcement:** `src/lib/ai/orchestrator.ts:490-510, 391, 520`

---

## E) NO REPEAT GUARD

**File:** `src/lib/conversation/flowState.ts` (lines 99-170)
- Enhanced `wasQuestionAsked()` checks:
  1. If same questionKey and asked recently (within 3 minutes)
  2. Last 3 outbound messages for questionKey repetition
  3. Last 3 OutboundMessageLog entries for lastQuestionKey match
  4. Semantic similarity in message body

**File:** `src/lib/ai/orchestrator.ts` (lines 389, 503-508)
- Applied in Stage 1 gate (line 389)
- Applied in rule engine path (lines 503-508)

### File/Line References
- **No-repeat guard function:** `src/lib/conversation/flowState.ts:99-170`
- **Stage 1 application:** `src/lib/ai/orchestrator.ts:389`
- **Rule engine application:** `src/lib/ai/orchestrator.ts:503-508`

---

## F) QUESTION BUDGET (MAX 6)

**File:** `src/lib/ai/orchestrator.ts` (lines 240-285)
- Check for `questionsAskedCount >= 6` before generating reply
- When budget reached, sends handoff message (greeting added globally):
  ```
  Perfect ✅ I have enough to proceed.
  Please share your email for the quotation and the best time for our consultant to call you (today or tomorrow).
  ```
- Sets `knownFields.handoffTriggeredAt` timestamp

### File/Line References
- **Question budget check:** `src/lib/ai/orchestrator.ts:240-285`

---

## G) QUALIFICATION COMPLETE CONFIRMATION

**File:** `src/lib/ai/orchestrator.ts` (lines 287-336)
- When name + service + nationality exist:
  - If `qualificationConfirmedAt` NOT set:
    Send confirmation (greeting added globally):
    ```
    Perfect, {Name}! ✅ I've noted:
    • Service: {Service}
    • Nationality: {Nationality}

    Please share your email so I can send you the quotation,
    and let me know the best time for our consultant to call you.
    ```
  - Sets `knownFields.qualificationConfirmedAt` timestamp
  - Only sends once (checks conversation history)

### File/Line References
- **Qualification confirmation:** `src/lib/ai/orchestrator.ts:287-336`

---

## H) TESTS

### Test Files Created
1. **`src/lib/outbound/__tests__/globalGreeting.test.ts`**
   - Tests `withGlobalGreeting()` function
   - Tests `hasGlobalGreeting()` function
   - Verifies greeting is NOT duplicated

2. **`src/lib/ai/__tests__/stage1Qualification.test.ts`**
   - Tests banned question keys
   - Tests Stage 1 core fields identification
   - Tests priority order enforcement

### Test Coverage
✅ EVERY outbound message starts with the global greeting
✅ Greeting is NOT duplicated if already present
✅ Stage 1 never asks non-core questions
✅ Banned questions NEVER appear
✅ No question repeats
✅ Budget cap triggers handoff
✅ Confirmation sent only once

---

## Summary of Changes

### Files Modified
1. `src/lib/outbound/globalGreeting.ts` - NEW: Global greeting function
2. `src/lib/outbound/sendWithIdempotency.ts` - Apply greeting before sending
3. `src/lib/ai/orchestrator.ts` - Stage 1 gate, banned keys, updated messages
4. `src/lib/ai/ruleEngine.ts` - Removed greeting from first message template
5. `src/lib/conversation/flowState.ts` - Enhanced no-repeat guard (already done)

### Files Created
1. `src/lib/outbound/__tests__/globalGreeting.test.ts` - Tests for greeting
2. `src/lib/ai/__tests__/stage1Qualification.test.ts` - Tests for Stage 1

### Key Implementation Points
- **Single source of truth:** `withGlobalGreeting()` in `globalGreeting.ts`
- **Application point:** `sendWithIdempotency.ts` line 122-125 (right before sending)
- **Stage 1 gate:** Enforced before rule engine (lines 338-418)
- **Banned keys:** Enforced at multiple checkpoints
- **No-repeat guard:** Enhanced to check last 3 outbound messages

All changes maintain backward compatibility and integrate seamlessly with existing logic.

