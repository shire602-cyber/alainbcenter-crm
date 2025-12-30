# WhatsApp Sending, Replies & Cron Job - Complete File Audit

**Repository:** `shire602-cyber/alainbcenter-crm`  
**Base URL:** `https://github.com/shire602-cyber/alainbcenter-crm/blob/master`

---

## 📥 WhatsApp Inbound (Webhooks)

### Primary Webhook Handler
- **`src/app/api/webhooks/whatsapp/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/webhooks/whatsapp/route.ts)
  - Handles inbound WhatsApp messages
  - Enqueues `OutboundJob` for async processing
  - Fire-and-forget kick to job runner

### Webhook Test/Debug Endpoints
- **`src/app/api/webhooks/whatsapp/test-verify/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/webhooks/whatsapp/test-verify/route.ts)
- **`src/app/api/webhooks/whatsapp/test-manual/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/webhooks/whatsapp/test-manual/route.ts)
- **`src/app/api/webhooks/whatsapp/diagnose/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/webhooks/whatsapp/diagnose/route.ts)
- **`src/app/api/webhooks/whatsapp/debug/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/webhooks/whatsapp/debug/route.ts)

### Inbound Processing Pipeline
- **`src/lib/inbound/autoMatchPipeline.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/inbound/autoMatchPipeline.ts)
  - Auto-match pipeline: deduplication, contact/conversation/lead creation, field extraction
- **`src/lib/inbound.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/inbound.ts)
  - Legacy wrapper around auto-match pipeline

---

## 📤 WhatsApp Outbound (Sending)

### Core Sending Functions
- **`src/lib/outbound/sendWithIdempotency.ts`** ⭐ **CRITICAL**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/outbound/sendWithIdempotency.ts)
  - **Single source of truth for all outbound sends**
  - Handles idempotency via `OutboundMessageLog`
  - Creates `Message` row for Inbox UI
  - Updates conversation timestamps

- **`src/lib/whatsapp.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/whatsapp.ts)
  - Low-level `sendTextMessage()` function
  - Calls Meta Cloud API directly

- **`src/lib/whatsappMeta.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/whatsappMeta.ts)
  - Meta Cloud API wrapper (`sendWhatsAppViaMeta`)

- **`src/lib/whatsappSender.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/whatsappSender.ts)
  - Autopilot-specific sender utility

- **`src/lib/whatsappClient.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/whatsappClient.ts)
  - Unified WhatsApp client wrapper

- **`src/lib/whatsapp-cloud-api.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/whatsapp-cloud-api.ts)
  - Direct Meta Cloud API implementation

### Outbound API Endpoints
- **`src/app/api/whatsapp/send/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/whatsapp/send/route.ts)
  - Manual WhatsApp send endpoint
  - Uses `sendOutboundWithIdempotency()`

- **`src/app/api/whatsapp/test-send/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/whatsapp/test-send/route.ts)
  - Test endpoint (disabled in production)

- **`src/app/api/chat/send/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/chat/send/route.ts)
  - Chat send endpoint (uses `sendWhatsApp` from messaging.ts)

- **`src/app/api/leads/[id]/messages/send/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/leads/[id]/messages/send/route.ts)
  - Lead-specific message send

- **`src/app/api/inbox/conversations/[id]/messages/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/inbox/conversations/[id]/messages/route.ts)
  - Inbox message send endpoint

- **`src/app/api/inbox/conversations/[id]/reply/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/inbox/conversations/[id]/reply/route.ts)
  - Inbox reply endpoint

### Messaging Abstraction Layer
- **`src/lib/messaging.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/messaging.ts)
  - `sendWhatsApp()` abstraction
  - Uses `sendOutboundWithIdempotency()` internally

### Outbound Helpers
- **`src/lib/outbound/globalGreeting.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/outbound/globalGreeting.ts)
  - First message greeting logic

- **`src/lib/outbound/idempotency.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/outbound/idempotency.ts)
  - Idempotency key computation

---

## 🤖 AI Replies & Orchestrator

### AI Orchestrator (Single AI Brain)
- **`src/lib/ai/orchestrator.ts`** ⭐ **CRITICAL**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/ai/orchestrator.ts)
  - **ONLY module allowed to call LLM**
  - Generates AI replies
  - First message bypass logic

- **`src/lib/ai/generate.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/ai/generate.ts)
  - `generateDraftReply()` function

- **`src/lib/ai/retrieverChain.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/ai/retrieverChain.ts)
  - Retrieval-augmented generation (RAG)
  - Training document search

### AI Reply Endpoints
- **`src/app/api/ai/draft-reply/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/ai/draft-reply/route.ts)
  - Draft reply generation endpoint
  - First message bypass

- **`src/app/api/leads/[id]/ai-reply/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/leads/[id]/ai-reply/route.ts)
  - Lead-specific AI reply

### Legacy Auto-Reply (Deprecated)
- **`src/lib/autoReply.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/autoReply.ts)
  - Legacy auto-reply handler (may still be used in some paths)

- **`src/lib/aiMessaging.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/aiMessaging.ts)
  - `generateAIAutoresponse()` function

---

## ⏰ Cron Jobs

### Outbound Job Processing (CRITICAL)
- **`src/app/api/cron/run-outbound-jobs/route.ts`** ⭐ **CRITICAL**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/cron/run-outbound-jobs/route.ts)
  - **Triggers job runner every minute**
  - Vercel cron endpoint
  - Accepts truthy `x-vercel-cron` header

### Other Cron Endpoints
- **`src/app/api/cron/run-reminders/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/cron/run-reminders/route.ts)
  - Sends scheduled reminders (every 5 minutes)

- **`src/app/api/cron/expiry-sweeper/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/cron/expiry-sweeper/route.ts)
  - Expiry tracking (daily at 9am)

- **`src/app/api/cron/process-jobs/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/cron/process-jobs/route.ts)
  - Automation job processing

- **`src/app/api/cron/run/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/cron/run/route.ts)
  - Scheduled automation rules

- **`src/app/api/cron/daily/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/cron/daily/route.ts)
  - Daily automation runner

- **`src/app/api/cron/daily-alerts/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/cron/daily-alerts/route.ts)
  - Daily alerts cron

- **`src/app/api/cron/process-followups/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/cron/process-followups/route.ts)
  - Follow-up processing

### Cron Configuration
- **`vercel.json`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/vercel.json)
  - Cron job schedules
  - `/api/cron/run-outbound-jobs` scheduled `* * * * *` (every minute)

---

## 🔄 Job Queue & Runner

### Job Runner (CRITICAL)
- **`src/app/api/jobs/run-outbound/route.ts`** ⭐ **CRITICAL**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/jobs/run-outbound/route.ts)
  - **Processes queued `OutboundJob` records**
  - Calls orchestrator → sends outbound → creates Message row
  - Marks job as DONE only if send succeeds

### Job Enqueueing
- **`src/lib/jobs/enqueueOutbound.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/jobs/enqueueOutbound.ts)
  - Enqueues outbound jobs (called by webhook)
  - Handles duplicate prevention

### Job Status (Admin)
- **`src/app/api/admin/outbound-jobs/status/route.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/admin/outbound-jobs/status/route.ts)
  - Admin debug endpoint for job queue status

---

## 🔗 Conversation & Threading

### Conversation Management
- **`src/lib/conversation/upsert.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/conversation/upsert.ts)
  - Ensures one conversation per (contactId, channel, externalThreadId)
  - Prevents duplicate conversations

- **`src/lib/conversation/getExternalThreadId.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/conversation/getExternalThreadId.ts)
  - Generates stable external thread IDs

---

## 📊 Database Schema

### Prisma Schema
- **`prisma/schema.prisma`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/prisma/schema.prisma)
  - `OutboundJob` model (job queue)
  - `OutboundMessageLog` model (idempotency)
  - `Message` model (inbox UI)
  - `Conversation` model (threading)

### Migrations
- **`prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql)
  - Adds `Conversation.deletedAt` and `Notification.snoozedUntil`

- **`prisma/migrations/20250129000000_add_outbound_job_queue/migration.sql`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/prisma/migrations/20250129000000_add_outbound_job_queue/migration.sql)
  - Creates `OutboundJob` table

---

## 🧪 Tests

### Webhook Tests
- **`src/app/api/webhooks/whatsapp/__tests__/jobQueue.test.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/webhooks/whatsapp/__tests__/jobQueue.test.ts)

- **`src/app/api/webhooks/whatsapp/__tests__/statusOnlyWebhook.test.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/webhooks/whatsapp/__tests__/statusOnlyWebhook.test.ts)

### Job Runner Tests
- **`src/app/api/jobs/__tests__/runOutbound.test.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/app/api/jobs/__tests__/runOutbound.test.ts)

### Outbound Tests
- **`src/lib/outbound/__tests__/sendWithIdempotency.test.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/outbound/__tests__/sendWithIdempotency.test.ts)

- **`src/lib/outbound/__tests__/idempotency.test.ts`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/src/lib/outbound/__tests__/idempotency.test.ts)

---

## 📚 Documentation

- **`docs/PRODUCTION_CHECKLIST.md`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/docs/PRODUCTION_CHECKLIST.md)
  - Production verification steps

- **`docs/PRODUCTION_FIXES_SUMMARY.md`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/docs/PRODUCTION_FIXES_SUMMARY.md)
  - Summary of all production fixes

- **`docs/AI_REPLY_SYSTEM_AUDIT.md`**
  - [View on GitHub](https://github.com/shire602-cyber/alainbcenter-crm/blob/master/docs/AI_REPLY_SYSTEM_AUDIT.md)
  - Complete AI reply system audit

---

## 🎯 Critical Path Flow

### Inbound Message Flow
```
1. WhatsApp Webhook → src/app/api/webhooks/whatsapp/route.ts
2. Auto-Match Pipeline → src/lib/inbound/autoMatchPipeline.ts
3. Enqueue Job → src/lib/jobs/enqueueOutbound.ts
4. Fire-and-forget kick → /api/jobs/run-outbound
```

### Outbound Reply Flow
```
1. Cron Trigger → src/app/api/cron/run-outbound-jobs/route.ts
2. Job Runner → src/app/api/jobs/run-outbound/route.ts
3. AI Orchestrator → src/lib/ai/orchestrator.ts
4. Send with Idempotency → src/lib/outbound/sendWithIdempotency.ts
5. WhatsApp API → src/lib/whatsapp.ts → src/lib/whatsappMeta.ts
6. Create Message Row → prisma.message.create()
```

---

## ⚠️ Key Files to Audit

### Most Critical (Must Review)
1. **`src/lib/outbound/sendWithIdempotency.ts`** - Single sender, idempotency, Message row creation
2. **`src/app/api/jobs/run-outbound/route.ts`** - Job processing, orchestrator call, send logic
3. **`src/app/api/cron/run-outbound-jobs/route.ts`** - Cron auth, job runner trigger
4. **`src/app/api/webhooks/whatsapp/route.ts`** - Webhook handler, job enqueueing
5. **`src/lib/ai/orchestrator.ts`** - AI reply generation

### Secondary (Should Review)
6. **`src/lib/whatsapp.ts`** - Low-level WhatsApp sending
7. **`src/lib/conversation/upsert.ts`** - Conversation threading
8. **`src/lib/jobs/enqueueOutbound.ts`** - Job enqueueing logic
9. **`vercel.json`** - Cron configuration

---

**Last Updated:** 2025-01-30  
**Repository:** `shire602-cyber/alainbcenter-crm`

