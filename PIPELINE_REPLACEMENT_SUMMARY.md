# AUTO-MATCH Pipeline Replacement Summary

## ✅ Completed: Replaced `handleInboundMessage` with `handleInboundMessageAutoMatch`

All webhook handlers have been updated to use the new AUTO-MATCH pipeline directly, replacing the legacy `handleInboundMessage` function.

---

## 📋 What Changed

### 1. **WhatsApp Webhook** (`src/app/api/webhooks/whatsapp/route.ts`)
- ✅ Removed redundant `checkInboundIdempotency` call (pipeline handles deduplication)
- ✅ Replaced `handleInboundMessage` with `handleInboundMessageAutoMatch`
- ✅ Updated to handle `DUPLICATE_MESSAGE` error from pipeline
- ✅ Updated logging to include `tasksCreated` and `extractedFields`

### 2. **Webchat Webhook** (`src/app/api/webhooks/webchat/route.ts`)
- ✅ Replaced `handleInboundMessage` with `handleInboundMessageAutoMatch`
- ✅ Updated to parse `fromPhone` vs `fromEmail` correctly
- ✅ Returns `tasksCreated` and `extractedFields` in response

### 3. **Email Webhook** (`src/app/api/webhooks/email/route.ts`)
- ✅ Replaced `handleInboundMessage` with `handleInboundMessageAutoMatch`
- ✅ Handles `DUPLICATE_MESSAGE` error gracefully
- ✅ Properly normalizes email addresses

### 4. **Instagram Webhook** (`src/app/api/webhooks/instagram/route.ts`)
- ✅ Replaced `handleInboundMessage` with `handleInboundMessageAutoMatch`
- ✅ Updated to use Instagram user IDs (not phone numbers)

### 5. **Facebook Webhook** (`src/app/api/webhooks/facebook/route.ts`)
- ✅ Replaced `handleInboundMessage` with `handleInboundMessageAutoMatch`
- ✅ Updated to use Facebook sender IDs (not phone numbers)

---

## 🎯 Benefits of New Pipeline

### **1. Deterministic Field Extraction**
- No LLM dependency for critical data extraction
- Uses keyword matching, regex patterns, and country demonyms
- Extracts: service, nationality, expiry dates, counts (partners/visas), identity (name/email)
- Stores in `Lead.dataJson` (append, don't overwrite)

### **2. Auto-Task Creation**
- **Reply due** task (10 minutes, marked DONE if auto-reply succeeds)
- **Quote** task (end of day, for business setup)
- **Qualification** task (2 hours, for visa services)
- **Renewal** tasks (based on expiry dates)
- All tasks use `idempotencyKey` to prevent duplicates

### **3. Smart Lead Reuse**
- Checks if `providerMessageId` already linked to a lead (idempotency)
- Finds open lead (not Won/Lost/Cold) created within last 30 days
- Only creates new lead if no open lead exists
- Updates `lastInboundAt` on existing lead

### **4. Better Deduplication**
- Uses `InboundMessageDedup` table (faster fail-fast approach)
- Creates record with `PROCESSING` status
- If unique constraint violation → duplicate, skip immediately
- Updates record with `conversationId` and `COMPLETED` status after processing

### **5. Enhanced Error Handling**
- Throws `DUPLICATE_MESSAGE` error for duplicates (webhook handlers catch and return 200 OK)
- All steps are awaited (no fire-and-forget)
- Auto-reply failures create alerts (non-blocking)

---

## 📊 Return Value Comparison

### **Old (`handleInboundMessage`):**
```typescript
{
  lead: any
  conversation: any
  message: any
  contact: any
}
```

### **New (`handleInboundMessageAutoMatch`):**
```typescript
{
  contact: any
  conversation: any
  lead: any
  message: any
  extractedFields: {
    service?: string
    nationality?: string
    expiries?: Array<{ type: string; date: Date }>
    counts?: { partners?: number; visas?: number }
    identity?: { name?: string; email?: string }
  }
  tasksCreated: number
  autoReplied: boolean
}
```

---

## 🔄 Backward Compatibility

The old `handleInboundMessage` function still exists in `src/lib/inbound.ts` as a **wrapper** around the new pipeline for backward compatibility. It:
- Converts old interface to new pipeline interface
- Handles `DUPLICATE_MESSAGE` error gracefully
- Maps new result to old interface

**Note:** All webhook handlers now use the new pipeline directly, so the wrapper is only for any other code that might still call `handleInboundMessage`.

---

## ✅ Testing Checklist

- [x] Build successful (`npm run build`)
- [x] No linter errors
- [x] All webhook handlers updated
- [x] Duplicate message handling tested
- [x] Error handling for `DUPLICATE_MESSAGE` implemented

---

## 🚀 Next Steps

1. **Test in staging environment:**
   - Send test messages via WhatsApp
   - Verify tasks are auto-created
   - Verify fields are extracted correctly
   - Verify duplicate messages are handled

2. **Monitor logs:**
   - Check for `[AUTO-MATCH]` log entries
   - Verify `tasksCreated` count
   - Verify `extractedFields` are populated

3. **Monitor database:**
   - Check `InboundMessageDedup` table for deduplication
   - Check `Task` table for auto-created tasks
   - Check `Lead.dataJson` for extracted fields

---

## 📝 Migration Notes

- The old `handleInboundMessage` wrapper can be removed in a future cleanup if no other code depends on it
- All webhook handlers now have consistent behavior across all channels
- The pipeline is more reliable and maintainable than the old function

---

**Date:** $(date)
**Status:** ✅ Complete - All webhook handlers migrated to AUTO-MATCH pipeline

