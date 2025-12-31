# AI Autopilot + Training System - Production Fixes Summary

## VERCEL DEPLOYMENT NOTE (CRITICAL)

**IMPORTANT**: Migrations are **NOT** run automatically during Vercel builds to prevent timeout issues.

**Why**: Database connections during build can timeout, causing deployment failures. Migrations should be run separately.

**How to Run Migrations**:

1. **Manual (Recommended)**: After deployment, run:
   ```bash
   npx prisma migrate deploy
   ```
   Or use the retry script:
   ```bash
   npm run migrate:deploy
   ```

2. **Vercel Post-Deploy Hook**: Set up a webhook that runs migrations after successful deployment

3. **Migration Endpoint**: Create an API endpoint that can be called to run migrations (with proper auth)

**Build Process**:
- `vercel-build`: Only runs `prisma generate && next build` (no migrations)
- `build`: Only runs `prisma generate && next build` (no migrations)
- `migrate:deploy`: Separate script with retry logic for running migrations

**See**: `docs/MIGRATION_DEPLOYMENT.md` for detailed migration deployment guide.

---

# AI Autopilot + Training System - Production Fixes Summary

## Overview
This document summarizes the critical production fixes applied to the AI Autopilot + Training system to address repetitive questions, fragile confirmation logic, duplicate outbound replies, and training management limitations.

## Changes Summary

### A) Orchestrator Ordering Fix ✅
**Problem**: Repetitive qualification questions because fields were extracted AFTER gating.

**Solution**: 
- Moved field extraction (`extractFieldsToState`) BEFORE Stage 1 qualification gate
- Added structured logging: `[ORCH] extracted fields` and `[ORCH] gate decision`
- Fields are now written to DB immediately before gating decisions

**Files Modified**:
- `src/lib/ai/orchestrator.ts` (lines 224-454)

**Key Changes**:
- Field extraction happens at Step 1.4 (before Step 1.7 gate)
- Updated `updatedKnownFields` used throughout gate logic
- Added structured logs with extracted keys and missing fields

**Verification**:
- Test: `src/lib/ai/__tests__/orchestratorFieldExtraction.test.ts`
- Log lines to grep: `[ORCH] extracted fields`, `[ORCH] gate decision`

---

### B) Remove String Matching for Confirmation ✅
**Problem**: Fragile substring-based "confirmation sent" detection (`includes('Perfect') && includes('Noted:')`).

**Solution**:
- Removed substring matching entirely
- Use only `qualificationConfirmedAt` state flag
- If flag exists => confirmation already sent
- If missing and qualification complete => send confirmation once and set flag

**Files Modified**:
- `src/lib/ai/orchestrator.ts` (lines 298-350)

**Key Changes**:
- Removed `conversation.messages.some(...)` substring check
- Use `updatedKnownFields.qualificationConfirmedAt` flag only
- Set flag to ISO timestamp when sending confirmation

**Verification**:
- Check logs: no substring matching in confirmation logic
- State flag persists in `conversation.knownFields.qualificationConfirmedAt`

---

### C) Structured Rule Engine Output ✅
**Problem**: Fragile substring-based "banned question" detection that could block legitimate replies.

**Solution**:
- Updated `executeRuleEngine` to return structured union type:
  - `{ kind: 'QUESTION'; questionKey: string; text: string; ... }`
  - `{ kind: 'REPLY'; text: string; needsHuman: boolean; ... }`
  - `{ kind: 'NO_MATCH'; ... }`
- Orchestrator checks `questionKey` (NOT substring) for banned questions
- Banned question keys only block `QUESTION` kind, not `REPLY` kind

**Files Modified**:
- `src/lib/ai/ruleEngine.ts` (lines 541-1280)
- `src/lib/ai/orchestrator.ts` (lines 465-576)

**Key Changes**:
- Rule engine returns structured result with `kind` discriminator
- Orchestrator handles each kind separately
- Banned check uses `questionKey` field (exact match, not substring)

**Verification**:
- Test: `src/lib/ai/__tests__/ruleEngineStructuredOutput.test.ts`
- Log lines to grep: `[RULE-ENGINE]`

---

### D) Unified Idempotency + Duplication Fix ✅
**Problem**: Duplicate outbound replies due to separate idempotency systems in OutboundJob and sendWithIdempotency.

**Solution**:
- Added `idempotencyKey` field to `OutboundJob` model
- Unified key format: `hash(conversationId + inboundProviderMessageId + channel + purpose=auto_reply)`
- `sendWithIdempotency` checks OutboundJob by idempotencyKey before sending
- OutboundJob becomes SENT only after Meta send success AND Message row created
- If Meta success but Message creation fails, keep job READY_TO_SEND with errorLog

**Files Modified**:
- `prisma/schema.prisma` (OutboundJob model, line 886)
- `src/lib/jobs/enqueueOutbound.ts` (lines 26-73)
- `src/lib/outbound/sendWithIdempotency.ts` (lines 68-112, 238-284)

**Key Changes**:
- `OutboundJob.idempotencyKey` unique constraint
- `computeIdempotencyKey` function exported from `enqueueOutbound.ts`
- `sendWithIdempotency` checks OutboundJob before creating OutboundMessageLog
- Same key format used in both systems

**Verification**:
- Test: `src/lib/outbound/__tests__/unifiedIdempotency.test.ts`
- Log lines to grep: `[OUTBOUND-IDEMPOTENCY]`, `[JOB-ENQUEUE]`

---

### E) Training Power-Up (Managed Via Admin UI) ✅
**Problem**: Training documents couldn't be filtered by stage/language/service, requiring code changes.

**Solution**:
- Added optional tags to `AITrainingDocument`:
  - `language: string | null` ('en' | 'ar' | null)
  - `stage: string | null` ('GREETING' | 'QUALIFICATION' | 'PRICING' | 'OBJECTIONS' | 'CLOSING' | 'POLICIES' | 'GENERAL' | null)
  - `serviceTypeId: Int?`
  - `serviceKey: String?`
- Updated upload and CRUD endpoints to accept/set tags
- Updated vectorStore search to filter by language/stage/serviceKey
- If no matching docs found, falls back to current behavior

**Files Modified**:
- `prisma/schema.prisma` (AITrainingDocument model, lines 689-702)
- `src/app/api/admin/ai-training/documents/route.ts` (POST, PUT)
- `src/app/api/admin/ai-training/upload/route.ts` (POST)
- `src/lib/ai/vectorStore.ts` (VectorDocument interface, search method, indexTrainingDocument)
- `src/lib/ai/retrieverChain.ts` (retrieveAndGuard options)

**Key Changes**:
- Schema migration required: `ALTER TABLE "AITrainingDocument" ADD COLUMN ...`
- Vector store metadata includes language/stage/serviceKey
- Search filters by these fields (null = all languages/stages/services)
- Admin APIs validate enum values

**Verification**:
- Create training doc with `language='en'`, `stage='QUALIFICATION'`
- Search with filters should only return matching docs
- Log lines to grep: `[VECTOR-SEARCH]`, `[TRAINING]`

---

### F) Debug / Verification Endpoints ✅
**Problem**: No way to inspect conversation state, qualification progress, or job queue without database access.

**Solution**:
- Added `GET /api/ai/debug/conversation?conversationId=...`
  - Returns: knownFields, qualificationStage, questionsAskedCount, lastQuestionKey, lastAutoReplyAt, lastInboundAt, lastOutboundAt
- Added `GET /api/jobs/debug?status=PENDING|READY_TO_SEND|FAILED`
  - Returns: counts + top 50 jobs + claim age + scheduledAt + idempotencyKey
- Both endpoints bypass middleware auth (same strategy as cron/webhooks/jobs)

**Files Created**:
- `src/app/api/ai/debug/conversation/route.ts`
- `src/app/api/jobs/debug/route.ts`

**Key Features**:
- Safe token auth can be added via `x-debug-token` header
- Returns structured JSON with all relevant state
- Job debug includes idempotencyKey for troubleshooting

**Verification**:
- Browser test: `GET /api/ai/debug/conversation?conversationId=1`
- Browser test: `GET /api/jobs/debug?status=PENDING`
- Log lines to grep: `[DEBUG]`

---

### G) Tests ✅
**Problem**: No regression tests for critical fixes.

**Solution**:
- Added minimal unit tests for key scenarios:
  - `orchestratorFieldExtraction.test.ts`: Inbound message contains service+name+nationality => orchestrator does NOT ask again
  - `unifiedIdempotency.test.ts`: Same inboundProviderMessageId enqueued twice => only one outbound send
  - `ruleEngineStructuredOutput.test.ts`: Banned questionKey blocks QUESTION kind only, not REPLY text

**Files Created**:
- `src/lib/ai/__tests__/orchestratorFieldExtraction.test.ts`
- `src/lib/outbound/__tests__/unifiedIdempotency.test.ts`
- `src/lib/ai/__tests__/ruleEngineStructuredOutput.test.ts`

**Verification**:
- Run: `npm test`
- All tests should pass

---

## Migration Required

### Database Schema Changes
1. **AITrainingDocument**: Add `language`, `stage`, `serviceTypeId`, `serviceKey` columns
2. **OutboundJob**: Add `idempotencyKey` column with unique constraint

**Migration Command**:
```bash
npx prisma migrate dev --name add_ai_training_tags_and_outbound_job_idempotency
```

**Manual SQL** (if migration fails):
```sql
ALTER TABLE "AITrainingDocument" ADD COLUMN "language" TEXT;
ALTER TABLE "AITrainingDocument" ADD COLUMN "stage" TEXT;
ALTER TABLE "AITrainingDocument" ADD COLUMN "serviceTypeId" INTEGER;
ALTER TABLE "AITrainingDocument" ADD COLUMN "serviceKey" TEXT;
CREATE INDEX "AITrainingDocument_language_stage_idx" ON "AITrainingDocument"("language", "stage");
CREATE INDEX "AITrainingDocument_serviceKey_idx" ON "AITrainingDocument"("serviceKey");
CREATE INDEX "AITrainingDocument_serviceTypeId_idx" ON "AITrainingDocument"("serviceTypeId");

ALTER TABLE "OutboundJob" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "OutboundJob_idempotencyKey_key" ON "OutboundJob"("idempotencyKey");
CREATE INDEX "OutboundJob_idempotencyKey_idx" ON "OutboundJob"("idempotencyKey");
```

---

## Browser Test URLs

### Debug Endpoints
1. **Conversation State**:
   ```
   GET /api/ai/debug/conversation?conversationId=1
   ```
   Expected JSON:
   ```json
   {
     "ok": true,
     "conversationId": 1,
     "state": {
       "qualificationStage": "COLLECTING_SERVICE",
       "questionsAskedCount": 1,
       "lastQuestionKey": "ASK_SERVICE",
       "knownFields": { "service": "Business Setup" }
     },
     ...
   }
   ```

2. **Job Queue**:
   ```
   GET /api/jobs/debug?status=PENDING
   ```
   Expected JSON:
   ```json
   {
     "ok": true,
     "counts": [
       { "status": "PENDING", "count": 5 },
       { "status": "SENT", "count": 100 }
     ],
     "jobs": [...],
     "total": 50
   }
   ```

---

## Log Lines to Grep

### Orchestrator
- `[ORCH] extracted fields` - Field extraction results
- `[ORCH] gate decision` - Qualification gate decision with missing fields
- `[ORCHESTRATOR]` - General orchestrator logs

### Rule Engine
- `[RULE-ENGINE]` - Rule engine execution logs
- `[RULE-ENGINE] Question ... asked recently` - Question repeat prevention

### Auto Reply
- `[AUTO-REPLY]` - Auto-reply handler logs

### Jobs
- `[JOB-ENQUEUE]` - Job enqueueing logs
- `[JOB]` - Job processing logs

### Send
- `[OUTBOUND-IDEMPOTENCY]` - Idempotency checks
- `[SEND]` - Message sending logs

### Training
- `[TRAINING]` - Training document operations
- `[VECTOR-SEARCH]` - Vector search logs

### Debug
- `[DEBUG]` - Debug endpoint logs

---

## Manual Verification Steps

1. **Field Extraction Before Gating**:
   - Send inbound: "Hi, my name is John, I need business setup, I am Indian"
   - Check logs: `[ORCH] extracted fields` should show service/name/nationality extracted
   - Verify: No questions asked for service/name/nationality

2. **Confirmation Flag**:
   - Complete qualification (name + service + nationality)
   - Check `conversation.knownFields.qualificationConfirmedAt` is set
   - Verify: Confirmation sent only once

3. **Structured Rule Engine**:
   - Check rule engine logs: should show `kind: 'QUESTION'` or `kind: 'REPLY'`
   - Verify: Banned question keys only block QUESTION kind

4. **Unified Idempotency**:
   - Enqueue same inboundProviderMessageId twice
   - Verify: Only one OutboundJob created, second returns `wasDuplicate: true`
   - Check `OutboundJob.idempotencyKey` matches `sendWithIdempotency` key format

5. **Training Tags**:
   - Create training doc with `language='en'`, `stage='QUALIFICATION'`
   - Search with filters
   - Verify: Only matching docs returned

---

## Files Changed Summary

### Core Logic
- `src/lib/ai/orchestrator.ts` - Field extraction ordering, confirmation flag, structured rule engine handling
- `src/lib/ai/ruleEngine.ts` - Structured output (QUESTION/REPLY/NO_MATCH)
- `src/lib/ai/stateMachine.ts` - Field extraction functions
- `src/lib/autoReply.ts` - (No changes, but uses orchestrator)

### Idempotency
- `src/lib/jobs/enqueueOutbound.ts` - Unified idempotency key computation
- `src/lib/outbound/sendWithIdempotency.ts` - OutboundJob idempotency check

### Training
- `src/lib/ai/vectorStore.ts` - Language/stage/serviceKey filtering
- `src/lib/ai/retrieverChain.ts` - Filter parameters
- `src/app/api/admin/ai-training/documents/route.ts` - CRUD with tags
- `src/app/api/admin/ai-training/upload/route.ts` - Upload with tags

### Debug
- `src/app/api/ai/debug/conversation/route.ts` - Conversation state debug
- `src/app/api/jobs/debug/route.ts` - Job queue debug

### Schema
- `prisma/schema.prisma` - AITrainingDocument tags, OutboundJob idempotencyKey

### Tests
- `src/lib/ai/__tests__/orchestratorFieldExtraction.test.ts`
- `src/lib/outbound/__tests__/unifiedIdempotency.test.ts`
- `src/lib/ai/__tests__/ruleEngineStructuredOutput.test.ts`

---

## Next Steps

1. **Run Migration**: Apply database schema changes
2. **Run Tests**: `npm test` to verify all tests pass
3. **Build**: `npm run build` to ensure no TypeScript errors
4. **Manual Testing**: Use debug endpoints to verify state
5. **Monitor Logs**: Grep for log lines to verify fixes are working

---

## Notes

- **UI Update Pending**: `ResponseSettingsTab.tsx` needs update to show/manage training tags (low priority)
- **Migration**: Schema changes require migration - run `npx prisma migrate dev`
- **Backward Compatibility**: All changes are backward compatible (new fields are nullable)

