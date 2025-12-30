# Duplicate Question Send Fix

## Problems Fixed

1. ✅ **Duplicate question sends** - Bot was sending the same questions multiple times (e.g., "Which service..." and "What is your nationality?" repeated)
2. ✅ **Service question too long** - Simplified from long list to "How can I help you today?"
3. ✅ **Forbidden terms** - Removed "Freelance Permit" and "Freelance Visa" from output

## Implementation

### A) Duplicate Question Send Blocker

**File:** `src/lib/outbound/sendWithIdempotency.ts` (lines 125-155)

**Implementation:**
- Added question-level send lock using `OutboundMessageLog`
- Before sending, checks if same `questionKey` was sent within last 60 minutes
- Query: `OutboundMessageLog` for `conversationId + replyType='question' + lastQuestionKey + status='SENT' + sentAt >= 60min ago`
- If found → DO NOT SEND (return early with `wasDuplicate: true`)

**Key Points:**
- Applied at the LAST possible moment (right before sending)
- Uses DB-based check (strongest, prevents webhook retry duplicates)
- Requires `replyType='question'` and `lastQuestionKey` to be passed

**File/Line References:**
- **Duplicate blocker:** `src/lib/outbound/sendWithIdempotency.ts:125-155`

### B) Ensure replyType and lastQuestionKey are Passed

**File:** `src/lib/autoReply.ts` (lines 1297-1308)

**Implementation:**
- Detects if `orchestratorResult.nextStepKey` indicates a question
- Sets `replyType='question'` for questions (ASK_*, ask_*, *_Q patterns)
- Sets `lastQuestionKey` from `nextStepKey` for questions
- Ensures duplicate blocker can work correctly

**File/Line References:**
- **Question detection:** `src/lib/autoReply.ts:1297-1308`

### C) Simplify Service Question Copy

**Files Updated:**
1. `src/lib/ai/orchestrator.ts` (line 377)
   - **OLD:** `"Thanks${name ? `, ${name}` : ''}. Which service are you looking for today? (Family Visa / Visit Visa / Freelance Visa / Freelance Permit / Business Setup / Golden Visa / PRO Services)"`
   - **NEW:** `"Thanks${name ? `, ${name}` : ''}. How can I help you today?"`

2. `src/lib/ai/ruleEngine.ts` (line 158)
   - **OLD:** `"Thanks{{#if name}}, {{name}}{{/if}}. Which service are you looking for today? (Family Visa / Visit Visa / Freelance Visa / Freelance Permit / Business Setup / Golden Visa / PRO Services)"`
   - **NEW:** `"Thanks{{#if name}}, {{name}}{{/if}}. How can I help you today?"`

3. `src/lib/replyEngine/templates.ts` (line 19)
   - **OLD:** `'Which service are you interested in? (Freelance Visa, Family Visa, Visit Visa, Business Setup, Golden Visa, etc.)'`
   - **NEW:** `'How can I help you today?'`

**File/Line References:**
- **Orchestrator service question:** `src/lib/ai/orchestrator.ts:377`
- **Rule engine service question:** `src/lib/ai/ruleEngine.ts:158`
- **Reply engine template:** `src/lib/replyEngine/templates.ts:19`

### D) Ban Forbidden Terms

**File:** `src/lib/outbound/sendWithIdempotency.ts` (lines 157-160)

**Implementation:**
- Added text sanitizer that runs on outbound text before sending
- Replaces:
  - "Freelance Permit" → "Freelance (self-sponsored)"
  - "Freelance Visa" → "Freelance (self-sponsored)"
- Case-insensitive replacement
- Applied after text normalization, before greeting

**File/Line References:**
- **Forbidden term sanitizer:** `src/lib/outbound/sendWithIdempotency.ts:157-160`

### E) Enhanced No-Repeat Guard

**File:** `src/lib/ai/orchestrator.ts` (lines 389, 504)

**Implementation:**
- Updated to use DB-based `wasQuestionAskedDB()` from `flowState.ts`
- Checks last 3 outbound messages for questionKey repetition
- Applied in Stage 1 gate and rule engine path

**File/Line References:**
- **Stage 1 no-repeat:** `src/lib/ai/orchestrator.ts:389`
- **Rule engine no-repeat:** `src/lib/ai/orchestrator.ts:504`

## Tests

**Files Created:**
1. `src/lib/outbound/__tests__/duplicateQuestionBlocker.test.ts`
   - Tests duplicate question blocking within 60 minutes
   - Tests allowing question after 60 minutes
   - Tests different questionKeys are allowed

2. `src/lib/outbound/__tests__/forbiddenTerms.test.ts`
   - Tests "Freelance Permit" replacement
   - Tests "Freelance Visa" replacement
   - Tests case-insensitive replacement
   - Tests multiple occurrences
   - Tests service question doesn't contain forbidden terms

## Summary

- **Duplicate blocker:** DB-based check in `sendWithIdempotency.ts` prevents same question within 60 minutes
- **Service question:** Simplified to "How can I help you today?" (no list, no forbidden terms)
- **Forbidden terms:** Sanitized before sending (Freelance Permit/Visa → Freelance (self-sponsored))
- **Question detection:** Auto-detects questions and sets `replyType='question'` correctly

All changes maintain backward compatibility and improve reliability.


