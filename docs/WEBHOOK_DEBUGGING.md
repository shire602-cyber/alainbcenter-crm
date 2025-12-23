# WhatsApp Webhook Debugging Guide

## Issue: Messages Not Appearing in App

If you're sending messages from your phone but they're not appearing in the app, follow these steps:

## Step 1: Check Webhook is Receiving Messages

### Check Vercel Logs
1. Go to **Vercel Dashboard** → Your Project → **Logs**
2. Send a test message from your phone
3. Look for these log entries:
   - `📥 WhatsApp webhook POST received`
   - `✅ Parsed webhook body:`
   - `📨 Processing X incoming message(s)`
   - `🔄 Calling handleInboundMessage`
   - `✅ Successfully processed inbound message`

### If No Logs Appear
- **Webhook not configured in Meta**: Check Meta Business Manager → WhatsApp → Configuration → Webhooks
- **Webhook URL incorrect**: Should be `https://your-app.vercel.app/api/webhooks/whatsapp`
- **Webhook not verified**: Must show green checkmark in Meta

## Step 2: Check for Errors

### In Vercel Logs, Look For:
- `❌ Error processing inbound message:` - Processing error
- `❌ Failed to create message:` - Database error
- `⚠️ Duplicate message detected` - Message already exists (this is OK)

### Common Errors:

#### Error: "Duplicate message detected"
**Status**: ✅ **OK** - Message was already processed, this prevents duplicates

#### Error: "Failed to create message"
**Possible causes**:
- Database connection issue
- Schema mismatch
- Missing required fields

**Solution**: Check database connection and schema

#### Error: "Contact not found" or "Lead not found"
**Status**: ⚠️ **Should auto-create** - Check if `handleInboundMessage` is working

## Step 3: Check Database

### Query Recent Messages
```sql
SELECT * FROM Message 
WHERE channel = 'whatsapp' 
AND direction = 'inbound' 
ORDER BY createdAt DESC 
LIMIT 10;
```

### Query Recent Conversations
```sql
SELECT * FROM Conversation 
WHERE channel = 'whatsapp' 
ORDER BY lastMessageAt DESC 
LIMIT 10;
```

### Query Webhook Events
```sql
SELECT * FROM ExternalEventLog 
WHERE provider = 'whatsapp' 
ORDER BY receivedAt DESC 
LIMIT 20;
```

## Step 4: Verify Webhook Configuration

### In Meta Business Manager:
1. Go to **WhatsApp** → **Configuration** → **Webhooks**
2. **Callback URL**: `https://your-app.vercel.app/api/webhooks/whatsapp`
3. **Verify Token**: Must match `WHATSAPP_VERIFY_TOKEN` in Vercel
4. **Subscription Fields**: Must include `messages`

### Test Webhook Verification:
```
GET https://your-app.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123
```

Should return: `test123` (plain text)

## Step 5: Check Phone Number Format

### Issue: Phone number normalization
- WhatsApp sends phone numbers **without** `+` prefix (e.g., `971501234567`)
- App normalizes to E.164 format (e.g., `+971501234567`)
- Check if contact lookup is working

### Debug Phone Lookup:
Check logs for:
- `🔄 Calling handleInboundMessage for {phone}`
- Phone number should be normalized correctly

## Step 6: Manual Test

### Test Webhook Endpoint Directly:
```bash
curl -X POST https://your-app.vercel.app/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "971501234567",
            "id": "test123",
            "timestamp": "1234567890",
            "type": "text",
            "text": { "body": "Test message" }
          }],
          "metadata": {
            "phone_number_id": "YOUR_PHONE_NUMBER_ID"
          }
        }
      }]
    }]
  }'
```

Check Vercel logs for processing.

## Step 7: Check Inbox API

### Test Inbox Endpoint:
```
GET https://your-app.vercel.app/api/inbox/conversations?channel=whatsapp
```

Should return conversations with messages.

## Common Issues & Solutions

### Issue 1: Messages Processed But Not Showing
**Cause**: Direction mismatch (`inbound` vs `INBOUND`)
**Solution**: ✅ Fixed - Now uses lowercase `inbound`

### Issue 2: Webhook Returns 200 But No Messages
**Cause**: Error in `handleInboundMessage` but webhook still returns 200
**Solution**: Check error logs, webhook returns 200 to prevent Meta retries

### Issue 3: Duplicate Messages
**Cause**: Webhook called multiple times
**Solution**: ✅ Fixed - Idempotency check via `providerMessageId`

### Issue 4: Messages Created But Conversation Not Updated
**Cause**: Transaction issue or error after message creation
**Solution**: Check logs for errors after message creation

## Debug Endpoints

### Check Webhook Status:
```
GET /api/webhooks/whatsapp/test-verify
```

### Check Recent Webhook Events:
```
GET /api/webhooks/whatsapp/debug
```

## Next Steps

If messages still don't appear:
1. Check Vercel logs for specific errors
2. Verify database has messages (SQL queries above)
3. Check if inbox API returns conversations
4. Verify webhook is actually being called (Meta webhook logs)

