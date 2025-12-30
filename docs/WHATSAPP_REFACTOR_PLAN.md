# WhatsApp Outbound & Cron System Refactor Plan

## Overview
Complete technical refactor to resolve message delivery failures caused by serverless timeouts and Meta API constraints.

## Schema Changes (COMPLETED)
- ✅ Added `status` enum: PENDING | GENERATING | READY_TO_SEND | SENT | FAILED
- ✅ Added `lastAttemptAt`: DateTime (updated on every retry)
- ✅ Added `errorLog`: String (Meta/AI error details)
- ✅ Added `content`: String (AI-generated reply before sending)
- ✅ Added `claimedAt`: DateTime (optimistic locking)
- ✅ Migration created: `prisma/migrations/*_add_outbound_job_status_fields/migration.sql`

## Implementation Status

### ✅ COMPLETED
1. Schema update with new fields
2. Migration file created
3. Updated `enqueueOutbound.ts` to use 'PENDING' status
4. Added `force-dynamic` to job runner route
5. Added stale job recovery query
6. Updated job query to use 'PENDING' and check `claimedAt`

### 🔄 IN PROGRESS
7. Decouple AI generation: Mark GENERATING → Generate → Save to content → Mark READY_TO_SEND
8. Add 24h window logic: Check last inbound timestamp, use template if >24h
9. Update send logic to use stored content and handle 24h window
10. Update error handling to use FAILED status
11. Update last_attempt_at on retries

### ⏳ PENDING
12. Add `force-dynamic` to all API routes
13. Update webhook to be lightning fast (<2s)
14. Test migration on local DB
15. Update all status references from old values (queued/running/done) to new (PENDING/GENERATING/SENT)

## Next Steps
1. Complete job runner refactor (handle READY_TO_SEND jobs, add 24h check)
2. Update sendWithIdempotency to handle 24h window and template logic
3. Add force-dynamic to all API routes
4. Test end-to-end flow

