# WhatsApp Webhook Verification Fix Guide

## Problem
Meta webhook verification is failing with error: "The callback URL or verify token couldn't be validated."

## Solution Steps

### Step 1: Get Your Current Verify Token

Visit this URL on your Vercel deployment (replace with your actual domain):
```
https://your-app.vercel.app/api/webhooks/whatsapp/test-verify?full=true
```

This will show you:
- The **exact verify token** your app is expecting
- Where it's stored (database or environment variable)
- Your webhook URL

### Step 2: Update Meta with Correct Token

1. Go to [Meta Developer Console](https://developers.facebook.com/apps)
2. Select your app → **WhatsApp** → **Configuration** → **Webhooks**
3. **Copy the FULL verify token** from Step 1
4. Paste it in the **"Verify Token"** field
5. **Callback URL** should be: `https://your-app.vercel.app/api/webhooks/whatsapp`
6. Click **"Verify and Save"**

### Step 3: Set Environment Variable (Alternative Method)

If you prefer to use an environment variable instead of the database:

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add:
   ```
   WHATSAPP_VERIFY_TOKEN=wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx
   ```
   (Use the token from your test-verify endpoint)
3. **Redeploy** your application

### Step 4: Update Integration in Database (Recommended)

The better approach is to update the Integration model:

1. Log into your Vercel deployment
2. Go to `/admin/integrations`
3. Find WhatsApp integration
4. Set the **Webhook Verify Token** field to: `wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx`
5. Save

### Step 5: Verify It Works

After updating, click **"Verify and Save"** in Meta again. You should see:
- ✅ Success message
- ✅ Green checkmark
- ✅ Webhook subscribed

## Common Issues

### Issue 1: Token Mismatch
**Symptom**: Verification fails even after updating
**Fix**: 
- Check for extra spaces or characters
- Make sure you copied the ENTIRE token (they're very long)
- Verify the token in both places matches exactly

### Issue 2: URL Not Accessible
**Symptom**: Meta can't reach your webhook URL
**Fix**:
- Make sure your Vercel deployment is live
- Check that the URL is HTTPS (Meta requires HTTPS)
- Test the URL manually: `https://your-app.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123`

### Issue 3: Token Not Found
**Symptom**: App returns "Webhook not configured" error
**Fix**:
- Either set `WHATSAPP_VERIFY_TOKEN` in Vercel environment variables
- OR configure it in `/admin/integrations` page
- Redeploy after setting environment variables

## Quick Test

Test the webhook endpoint manually:

```bash
# Replace with your actual values
curl "https://your-app.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx&hub.challenge=test123"
```

**Expected Response**: Should return `test123` as plain text (not JSON)

## What the Token Should Look Like

Your verify token from the image:
```
wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx
```

Make sure this EXACT string (including all hyphens and characters) is:
1. Stored in your database (Integration model) OR
2. Set in Vercel environment variable `WHATSAPP_VERIFY_TOKEN` OR
3. Both (database takes priority)

## Webhook Fields to Subscribe

After verification succeeds, subscribe to these fields:
- ✅ `messages` (required)
- ✅ `message_statuses` (optional, for delivery receipts)

Then click **"Verify and Save"** again to save subscriptions.

