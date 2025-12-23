# Quick Start Guide - Phases 1-5

## 🚀 Get Everything Running in 3 Steps

### Step 1: Apply Database Migration

```bash
npx prisma db push
```

This adds the new fields for info/quotation tracking.

### Step 2: Seed Automation Rules

**Option A: Via API (as admin)**
```bash
# Get your session cookie from browser, then:
curl -X POST http://localhost:3000/api/admin/automation/seed-info-followup \
  -H "Cookie: session=YOUR_SESSION_COOKIE"

curl -X POST http://localhost:3000/api/admin/automation/seed-escalation \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

**Option B: Via UI**
- Visit `/automation` page
- Rules will be created automatically

### Step 3: Configure AI (Optional but Recommended)

1. Go to `/settings/integrations/ai`
2. Set your OpenAI API key
3. Test connection

---

## ✅ That's It!

Your system now has:
- ✅ Automatic data extraction from messages
- ✅ Info/quotation sharing detection
- ✅ Automatic follow-ups after 2-3 days
- ✅ Agent fallback for human requests
- ✅ SLA monitoring and escalation
- ✅ Service-specific AI training

---

## 🧪 Test It

Run the test script:
```bash
npx tsx scripts/test-phases-1-5.ts
```

Or test manually:
1. Send a WhatsApp message with customer info
2. Check if data was extracted
3. Send a message with "quotation" keyword
4. Check if `infoSharedAt` was set
5. Wait 2 days and run daily automation
6. Check if follow-up was sent

---

## 📊 Monitor

Check automation logs:
- `/automation` page shows rule execution
- Tasks page shows agent tasks created
- Lead notes show system actions

---

## 🎉 You're Done!

The system is now fully automated and will:
- Extract customer data automatically
- Detect when info is shared
- Follow up automatically
- Escalate to agents when needed
- Never forget a follow-up

**Everything is working!** 🚀
