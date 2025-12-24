# Simplified Autopilot System

## Overview

The automation system has been simplified to remove the worker/queue architecture. Auto-replies now happen **immediately** when messages arrive via webhook handlers.

## Architecture

### Immediate Auto-Reply Flow

```
WhatsApp Message Arrives
    ↓
Webhook Handler (/api/webhooks/whatsapp)
    ↓
Store Message in Database
    ↓
handleInboundAutoReply() - IMMEDIATE
    ↓
Check: autoReplyEnabled? muted? rate limit? business hours?
    ↓
Check: needsHumanAttention? (payment dispute, angry, legal)
    ↓
Check: AI can respond? (retriever-first chain)
    ↓
Generate AI Reply
    ↓
Send via WhatsApp Cloud API - IMMEDIATE
    ↓
Save Outbound Message
    ↓
Return 200 OK
```

**No queue. No worker. No "Start Worker" button. Just works.**

## Features

### 1. Per-Lead Auto-Reply Settings

On the Lead detail page, you'll find an **"Autopilot"** card with:
- **Auto-reply enabled** toggle
- **Allow outside business hours** toggle  
- **Reply mode** dropdown (AI Only / Templates First / Off)
- **"Send follow-up now"** button

### 2. Follow-ups & Reminders

On the Lead detail page, you'll find a **"Reminders"** card where you can:
- Add reminders (Follow-up, Expiry, Document Request, Custom)
- Set date/time
- Choose channel (WhatsApp/Email)
- View upcoming and sent reminders

### 3. Scheduled Reminders (Vercel Cron)

- **Reminders cron** (`/api/cron/run-reminders`): Runs every 5 minutes, sends due reminders
- **Expiry sweeper** (`/api/cron/expiry-sweeper`): Runs daily at 9 AM, creates reminders for leads with upcoming expiries (90/60/30/7 days)

## What Was Removed

- ❌ `/automation` page (deleted)
- ❌ "Start Worker" / "Stop Worker" buttons
- ❌ "Run Now" button
- ❌ Worker/queue system (deprecated, kept for backward compatibility)
- ❌ Automation page from navigation

## What Was Added

- ✅ `src/lib/autoReply.ts` - Immediate auto-reply handler
- ✅ `src/components/leads/AutopilotCard.tsx` - Per-lead auto-reply settings
- ✅ `src/components/leads/RemindersCard.tsx` - Follow-ups & reminders UI
- ✅ `src/app/api/cron/run-reminders/route.ts` - Scheduled reminders cron
- ✅ `src/app/api/cron/expiry-sweeper/route.ts` - Expiry reminder creation
- ✅ `Reminder` model in Prisma schema
- ✅ Auto-reply fields on `Lead` model

## Database Changes

Run migration to add new fields:

```bash
npx prisma migrate dev --name add_auto_reply_and_reminders
```

New fields on `Lead`:
- `autoReplyEnabled` (Boolean, default: true)
- `autoReplyMode` (String: AI_ONLY | TEMPLATES_FIRST | OFF)
- `mutedUntil` (DateTime, optional)
- `lastAutoReplyAt` (DateTime, optional - for rate limiting)
- `allowOutsideHours` (Boolean, default: false)

New model `Reminder`:
- Links to Lead
- Type: FOLLOW_UP | EXPIRY | DOCUMENT_REQUEST | CUSTOM
- Scheduled date/time
- Channel: WHATSAPP | EMAIL
- Sent status and error tracking

## Testing

1. **Test immediate auto-reply:**
   - Send a WhatsApp message to a test number
   - Check inbox - you should see inbound message
   - Within seconds, you should see AI reply (if auto-reply enabled and AI can respond)

2. **Test follow-up reminder:**
   - Go to Lead detail page
   - Add a reminder for 1 minute from now
   - Wait 1 minute
   - Check cron logs - reminder should be sent

3. **Test expiry sweeper:**
   - Create a lead with expiry date 90 days from now
   - Wait for daily cron (or trigger manually)
   - Check reminders - should see 90-day reminder created

## Configuration

### Environment Variables

- `AI_SIMILARITY_THRESHOLD` (default: 0.7) - Minimum similarity score for AI to respond
- `CRON_SECRET` - Secret for cron endpoint authorization

### Vercel Cron

Configured in `vercel.json`:
- `*/5 * * * *` - Run reminders every 5 minutes
- `0 9 * * *` - Expiry sweeper daily at 9 AM

## Migration Notes

- Old automation rules are still in database but not used for auto-reply
- Worker system code is kept but deprecated (no longer auto-starts)
- Automation page routes return 404 (pages deleted)
- All worker UI buttons removed from components

