# 🔧 Fix: Auto-Reply Not Working

## The Problem

You seeded info-followup and escalation rules, but **those don't trigger auto-replies**. You need `INBOUND_MESSAGE` rules to automatically reply to incoming messages.

## ✅ Solution: Seed INBOUND_MESSAGE Rules

### Step 1: Seed Inbound Message Rules

Visit this URL in your browser (same way as migration):
```
https://your-app.vercel.app/api/admin/automation/seed-inbound
```

You should see:
```json
{
  "ok": true,
  "message": "Default automation rules seeded successfully"
}
```

This creates 4 rules:
1. **New WhatsApp Enquiry** - Auto-replies to new leads
2. **Price Inquiry Response** - Auto-replies when customer asks about pricing
3. **Renewal Detection** - Auto-replies when renewal keywords detected
4. **Hot Lead Instant Reply** - Auto-replies to hot leads (score >= 70)

---

## Why It Wasn't Working

- ✅ **Migration:** Applied (columns exist)
- ✅ **Info-followup rules:** Seeded (for follow-ups after info shared)
- ✅ **Escalation rules:** Seeded (for escalations)
- ❌ **INBOUND_MESSAGE rules:** **NOT SEEDED** (these trigger auto-replies!)

**The `INBOUND_MESSAGE` rules are what send automatic replies when messages arrive!**

---

## After Seeding

Once you seed the inbound rules:
1. ✅ New messages will trigger automation
2. ✅ AI will generate replies automatically
3. ✅ Replies will be sent via WhatsApp
4. ✅ All Phase 1-5 features will work

---

## Test

After seeding:
1. Send a new WhatsApp message
2. Wait 5-10 seconds
3. Check the conversation - you should see an AI-generated reply!

---

## Status

- ✅ **Migration:** Applied
- ✅ **Info-followup rules:** Seeded
- ✅ **Escalation rules:** Seeded
- ⚠️ **INBOUND_MESSAGE rules:** **NEED TO BE SEEDED** (visit URL above)

**Seed the inbound rules to enable auto-replies!** 🚀
