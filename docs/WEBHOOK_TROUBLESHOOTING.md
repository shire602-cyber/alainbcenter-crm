# Webhook Verification Troubleshooting Guide

## Current Status
Webhook verification is failing with: "The callback URL or verify token couldn't be validated."

## Step 1: Check Your Token

Visit this URL (replace with your Vercel domain and actual token):
```
https://alainbcenter-9df2z3g2i-abdurahmans-projects-66129df5.vercel.app/api/webhooks/whatsapp/test-verify?full=true
```

This will show you the **exact token** your app expects.

## Step 2: Test Webhook Manually

Test the webhook endpoint directly with your token:
```
https://alainbcenter-9df2z3g2i-abdurahmans-projects-66129df5.vercel.app/api/webhooks/whatsapp/test-manual?hub.mode=subscribe&hub.verify_token=wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx&hub.challenge=test123
```

Replace `wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx` with your actual token.

**Expected Response:**
- If tokens match: Returns `test123` as plain text
- If tokens don't match: Returns JSON with comparison details

## Step 3: Check Vercel Logs

1. Go to **Vercel Dashboard** → Your Project → **Logs**
2. Click **"Verify and Save"** in Meta
3. Immediately check the logs for:
   - `📥 Webhook verification request received`
   - `✅ Found verify token in integration config` OR `✅ Found verify token in environment variable`
   - `✅ WhatsApp webhook verified successfully!` (success)
   - `⚠️ WhatsApp webhook verification failed` (failure with details)

## Step 4: Verify Token in Database

The token must be stored in the database correctly:

1. Go to `/admin/integrations`
2. Check the "Webhook Verify Token" field
3. It should match EXACTLY what you pasted in Meta

## Step 5: Common Issues

### Issue 1: Token Not in Database
**Symptom**: Logs show `⚠️ No verify token found`

**Fix**: 
1. Go to `/admin/integrations`
2. Make sure "Webhook Verify Token" field has a value
3. Click "Save & Enable"
4. OR set `WHATSAPP_VERIFY_TOKEN` in Vercel environment variables

### Issue 2: Token Mismatch
**Symptom**: Logs show `tokenMatches: false`

**Fix**:
1. Get the token from `/api/webhooks/whatsapp/test-verify?full=true`
2. Copy it EXACTLY (including all characters)
3. Paste it in Meta (no extra spaces)
4. Also update your database to match Meta's token

### Issue 3: Database Connection
**Symptom**: Logs show `⚠️ Could not fetch integration from DB`

**Fix**:
1. Check `DATABASE_URL` is set in Vercel
2. Verify Neon database is accessible
3. Redeploy after setting `DATABASE_URL`

### Issue 4: Wrong URL
**Symptom**: Meta can't reach your endpoint

**Fix**:
1. Make sure URL is: `https://alainbcenter-9df2z3g2i-abdurahmans-projects-66129df5.vercel.app/api/webhooks/whatsapp`
2. Must be HTTPS (not HTTP)
3. Must include `/api/webhooks/whatsapp` path
4. Test in browser - should return error about missing parameters (not 404)

## Step 6: Debug Endpoint

Use the debug endpoint to see exactly what's being compared:
```
https://alainbcenter-9df2z3g2i-abdurahmans-projects-66129df5.vercel.app/api/webhooks/whatsapp/debug?hub.mode=subscribe&hub.verify_token=wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx&hub.challenge=test123
```

This shows:
- Token from Meta
- Token from Database
- Character-by-character comparison
- Why they don't match (if they don't)

## Quick Test Checklist

- [ ] Token exists in database (`/admin/integrations`)
- [ ] Token in Meta matches token in database EXACTLY
- [ ] URL is correct and accessible
- [ ] Vercel logs show verification attempt
- [ ] Test endpoint returns challenge when tokens match

## Still Not Working?

Share:
1. Output from `/api/webhooks/whatsapp/test-verify?full=true`
2. Output from `/api/webhooks/whatsapp/test-manual` with your token
3. Vercel logs when Meta tries to verify
4. Error message from Meta (if any)

