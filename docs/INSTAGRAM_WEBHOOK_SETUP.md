# Instagram Webhook Setup Guide

## Overview

Instagram Direct Messages (DMs) require a separate webhook subscription from Facebook Page messages. This guide explains how to configure Instagram webhooks in Meta Developer Console.

## Critical Requirements

1. **Separate Subscription**: Instagram Business Account webhooks are separate from Facebook Page webhooks
2. **Manual Setup May Be Required**: Some Instagram accounts do not support API-based webhook subscription and must be configured manually in Meta Developer Console UI
3. **Webhook URL**: Both Page and Instagram webhooks should point to the same endpoint: `/api/webhooks/meta`
4. **Verify Token**: The verify token configured in Meta Developer Console must match the token stored in the CRM

## Automatic Setup (via API)

When you connect the Meta integration using the Admin UI:

1. The system attempts to subscribe the Facebook Page to webhooks automatically
2. The system attempts to subscribe the Instagram Business Account to webhooks automatically
3. If Instagram subscription succeeds, you're done! ✅

## Manual Setup (if API Subscription Fails)

If the automatic Instagram subscription fails (common for some accounts), follow these steps:

### Step 1: Navigate to Meta Developer Console

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your app
3. In the left sidebar, navigate to **Products** → **Instagram** → **Webhooks**

### Step 2: Configure Webhook for Instagram Product

1. Click **"Add Callback URL"** or edit existing webhook
2. Enter your webhook URL:
   ```
   https://yourdomain.com/api/webhooks/meta
   ```
   (Replace `yourdomain.com` with your actual domain)

3. Enter your **Verify Token**:
   - This should match the verify token you configured in the CRM
   - You can find this token in the CRM Admin → Integrations → Meta settings
   - Or check the Integration config in your database

4. Click **"Verify and Save"**
   - Meta will send a GET request to your webhook endpoint
   - Your endpoint should return the `hub.challenge` value if verification succeeds

### Step 3: Subscribe to Webhook Fields

After verifying the webhook URL, subscribe to the required fields:

1. **Required Fields**:
   - ✅ `messages` - Receives Instagram Direct Messages
   - ✅ `messaging_postbacks` - Receives user interactions (optional but recommended)

2. Check the boxes for the fields you want to subscribe to

3. Click **"Save"**

### Step 4: Verify Subscription Status

You can verify that your webhook is properly configured using the CRM diagnostics endpoint:

```bash
GET /api/integrations/meta/diagnostics
```

Or check the status in the Admin UI:
- Go to Admin → Integrations → Meta
- Look for "Instagram Business Account" subscription status
- Should show "✓ Subscribed" with fields listed

## Troubleshooting

### Webhook Verification Fails (403 Error)

**Problem**: Meta returns 403 when trying to verify the webhook.

**Solutions**:
1. Check that your verify token matches exactly (case-sensitive)
2. Ensure the webhook endpoint `/api/webhooks/meta` is publicly accessible
3. Check that the endpoint returns the `hub.challenge` value correctly
4. Verify your middleware allows `/api/webhooks/meta` to bypass authentication

### Instagram DMs Not Received

**Problem**: Facebook Page messages work, but Instagram DMs are not received.

**Solutions**:
1. **Check Instagram Subscription Status**:
   - Use `/api/integrations/meta/diagnostics` endpoint
   - Or check Admin UI → Integrations → Meta
   - Look for "Instagram Business Account" subscription status

2. **Verify Meta Developer Console Configuration**:
   - Ensure webhook is configured for **Instagram product** (not just Page product)
   - Check that `messages` field is subscribed
   - Verify webhook URL is correct: `/api/webhooks/meta`

3. **Check Instagram Account Settings**:
   - Instagram account must be a Professional (Business or Creator) account
   - Go to Instagram app → Settings → Privacy → Messages
   - Under "Connected Tools", ensure "Allow access to messages" is enabled

4. **Check Meta Developer Console Webhook Logs**:
   - Go to Meta Developers → Your App → Instagram → Webhooks
   - Check the webhook logs for any delivery failures
   - Look for error messages or failed delivery attempts

### API Subscription Not Supported

**Problem**: Error message indicates API-based subscription is not supported for this account.

**Solution**: This is normal for some Instagram accounts. You must configure the webhook manually in Meta Developer Console UI (follow "Manual Setup" steps above).

### Webhook URL Not Accessible

**Problem**: Healthcheck fails when testing webhook endpoint.

**Solutions**:
1. Ensure your application is deployed and publicly accessible
2. Check that the webhook endpoint `/api/webhooks/meta` exists
3. Verify your Vercel/cloud provider configuration allows public access
4. Test the endpoint directly:
   ```bash
   curl https://yourdomain.com/api/webhooks/meta
   ```
   Should return: `{"ok":true,"mode":"healthcheck"}`

## Testing Instagram Webhook

1. **Send a Test DM**:
   - From a personal Instagram account, send a DM to your Instagram Business Account
   - The message should trigger a webhook event

2. **Check Webhook Delivery**:
   - Check Vercel logs for POST requests to `/api/webhooks/meta`
   - Look for logs like: `📥 [META-WEBHOOK] Raw payload structure: { object: 'instagram', ... }`

3. **Verify Message in CRM**:
   - Go to Inbox → Instagram channel
   - The message should appear as a new conversation or message

## Additional Resources

- [Meta Instagram Messaging API Documentation](https://developers.facebook.com/docs/instagram-api/guides/messaging)
- [Meta Webhooks Documentation](https://developers.facebook.com/docs/graph-api/webhooks)
- [Instagram Business Account Setup](https://help.instagram.com/502981923235522)

## Quick Checklist

- [ ] Facebook Page webhook subscribed (via API or manual)
- [ ] Instagram Business Account webhook subscribed (via API or manual)
- [ ] Webhook URL configured: `https://yourdomain.com/api/webhooks/meta`
- [ ] Verify token matches in both Meta Console and CRM
- [ ] `messages` field subscribed for Instagram
- [ ] `messaging_postbacks` field subscribed (optional)
- [ ] Instagram account is Professional (Business/Creator) account
- [ ] "Allow access to messages" enabled in Instagram settings
- [ ] Webhook endpoint healthcheck passes
- [ ] Test DM sent and received in CRM inbox

