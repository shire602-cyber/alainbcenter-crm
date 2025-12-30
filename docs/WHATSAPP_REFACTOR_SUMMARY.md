# WhatsApp Outbound & Cron System Refactor - Summary

## ✅ COMPLETED

### 1. Schema Update
- ✅ Added `status` enum: PENDING | GENERATING | READY_TO_SEND | SENT | FAILED
- ✅ Added `lastAttemptAt`: DateTime? (updated on every retry)
- ✅ Added `errorLog`: String? (Meta/AI error details)
- ✅ Added `content`: String? (AI-generated reply before sending)
- ✅ Added `claimedAt`: DateTime? (optimistic locking)
- ✅ Migration created: `prisma/migrations/*_add_outbound_job_status_fields/migration.sql`
- ✅ Prisma Client regenerated

### 2. Job Runner Refactor
- ✅ Updated job query to handle both PENDING and READY_TO_SEND jobs
- ✅ Added stale job recovery (reset GENERATING/READY_TO_SEND >5min to PENDING)
- ✅ Implemented optimistic locking with `claimedAt`
- ✅ Decoupled AI generation: PENDING → GENERATING → AI generates → saves to content → READY_TO_SEND
- ✅ Updated status references: queued→PENDING, running→GENERATING, done→SENT, failed→FAILED
- ✅ Added `lastAttemptAt` updates on every retry
- ✅ Added error logging to `errorLog` field

### 3. 24-Hour Window Logic
- ✅ Added check for last inbound message timestamp
- ✅ Jobs outside 24h window are marked FAILED with clear error (template logic to be implemented)
- ✅ Logging includes `within24h` flag

### 4. Meta Response Logging
- ✅ Updated `WhatsAppResponse` interface to include `pacing` status
- ✅ Added logging of full Meta response (including pacing status)
- ✅ Updated `sendTextMessage` return type to include `pacingStatus`

### 5. Force-Dynamic Routes
- ✅ Added `export const dynamic = 'force-dynamic'` to:
  - `src/app/api/jobs/run-outbound/route.ts`
  - `src/app/api/webhooks/whatsapp/route.ts`
  - `src/app/api/cron/run-outbound-jobs/route.ts`

### 6. Code Quality
- ✅ Build passes successfully
- ✅ All TypeScript errors resolved
- ✅ Prisma Client regenerated

## 🔄 REMAINING WORK

### 1. Webhook Optimization (Partially Complete)
- ✅ Webhook already enqueues jobs quickly
- ⏳ Verify webhook returns <2s consistently
- ⏳ Add performance monitoring

### 2. Template Logic for 24h Window
- ⏳ Implement template message sending when outside 24h window
- ⏳ Create "Utility" template in Meta Business Manager
- ⏳ Update `sendWithIdempotency` to handle template messages

### 3. Additional Force-Dynamic Routes
- ⏳ Add `force-dynamic` to remaining API routes (if needed)

### 4. Testing
- ⏳ Test end-to-end flow: webhook → job enqueue → AI generation → send
- ⏳ Test stale job recovery
- ⏳ Test 24h window logic
- ⏳ Test retry logic with `lastAttemptAt` updates

### 5. Migration Deployment
- ⏳ Run migration on production: `npx prisma migrate deploy`
- ⏳ Verify migration applied successfully

## 📋 Migration Commands

```bash
# Local development
npx prisma migrate dev

# Production
npx prisma migrate deploy
npx prisma generate
```

## 🎯 Key Improvements

1. **Decoupled AI Generation**: AI generation and Meta API calls are now separate, preventing 60s timeout issues
2. **Stale Job Recovery**: Jobs stuck in GENERATING/READY_TO_SEND are automatically recovered
3. **Optimistic Locking**: `claimedAt` prevents multiple workers from processing the same job
4. **Better Error Tracking**: `errorLog` field stores detailed error information
5. **24h Window Enforcement**: System checks and enforces WhatsApp's 24-hour messaging window
6. **Status Tracking**: Clear status flow: PENDING → GENERATING → READY_TO_SEND → SENT/FAILED

## 📝 Notes

- The webhook is already optimized for speed (<300ms target)
- Template logic for 24h window needs to be implemented in `sendWithIdempotency.ts`
- All status values have been updated to the new enum format
- Build passes successfully with all changes

