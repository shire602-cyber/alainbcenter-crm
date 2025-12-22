# WhatsApp Webhook Verification - Debugging Steps

## Problem
After setting the verify token in the database, Meta webhook verification still fails.

## Step 1: Check What Token is Actually Stored

After deploying, visit this URL (replace with your Vercel domain):
```
https://your-app.vercel.app/api/webhooks/whatsapp/test-verify?full=true
```

This shows the exact verify token your app expects.

## Step 2: Use Debug Endpoint

Visit this URL to see detailed comparison:
```
https://your-app.vercel.app/api/webhooks/whatsapp/debug?hub.mode=subscribe&hub.verify_token=wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx&hub.challenge=test123
```

Replace:
- `your-app.vercel.app` with your actual Vercel domain
- `wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx` with your actual verify token

This endpoint shows:
- ✅ Token from Meta (what you pasted)
- ✅ Token from Database (what's stored)
- ✅ Token from Environment Variable (if set)
- ✅ Character-by-character comparison
- ✅ Why they don't match (if they don't)

## Step 3: Check Vercel Logs

1. Go to Vercel Dashboard → Your Project → **Logs**
2. Click "Verify and Save" in Meta again
3. Look for log entries like:
   - `📥 Webhook verification request received`
   - `✅ Found verify token in integration config` or `✅ Found verify token in environment variable`
   - `⚠️ WhatsApp webhook verification failed` (with detailed comparison)

The logs will show:
- Token lengths
- First 5 and last 5 characters
- Whether tokens match exactly
- Character-by-character comparison

## Step 4: Common Issues & Fixes

### Issue A: Token Not in Database
**Symptom**: Logs show `⚠️ No verify token found` or `tokenSource: 'none'`

**Fix**: Run the script again:
```powershell
$env:DATABASE_URL="your-neon-connection-string"
npx tsx scripts/set-whatsapp-verify-token.ts "wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx"
```

### Issue B: Config Not Parsing Correctly
**Symptom**: Logs show `❌ Failed to parse integration config`

**Fix**: The config might be corrupted. Update via admin UI:
1. Go to `/admin/integrations`
2. Edit WhatsApp integration
3. Set Verify Token again
4. Save

### Issue C: Token Mismatch (Different Characters)
**Symptom**: Logs show `tokenMatches: false` but lengths are the same

**Possible causes**:
- Hidden/invisible characters (spaces, tabs, newlines)
- Different encoding (Unicode vs ASCII)
- Copy-paste added extra characters

**Fix**: 
1. Get the token from `/api/webhooks/whatsapp/test-verify?full=true`
2. Copy it EXACTLY (including all characters)
3. Paste in Meta
4. Or use the token from Meta and update your database to match exactly

### Issue D: Database Connection Issues
**Symptom**: Logs show `⚠️ Could not fetch integration from DB`

**Fix**:
1. Check `DATABASE_URL` is set in Vercel environment variables
2. Test database connection
3. Verify Neon database is accessible
4. Redeploy after setting `DATABASE_URL`

## Step 5: Alternative - Use Environment Variable

If database isn't working, use environment variable:

1. **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add:
   - Key: `WHATSAPP_VERIFY_TOKEN`
   - Value: `wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx` (your exact token)
3. **Redeploy** your application
4. The webhook will use the environment variable as fallback

## Step 6: Verify the Fix

After making changes:

1. **Wait 1-2 minutes** for deployment to complete
2. Visit: `https://your-app.vercel.app/api/webhooks/whatsapp/test-verify?full=true`
3. Copy the token shown
4. In Meta, paste that EXACT token
5. Click "Verify and Save"
6. Check Vercel logs to see the verification attempt

## What the Debug Endpoint Shows

```json
{
  "success": true,
  "request": {
    "mode": "subscribe",
    "tokenProvided": true,
    "token": "wa-verify-..."
  },
  "integration": {
    "exists": true,
    "webhookVerifyToken": "wa-verify-..."
  },
  "tokens": {
    "fromDatabase": "wa-verify-...",
    "fromEnv": null,
    "used": "wa-verify-...",
    "source": "database"
  },
  "comparison": {
    "fromMeta": { "value": "...", "length": 45 },
    "fromDatabase": { "value": "...", "length": 45 },
    "match": true
  },
  "willVerify": true
}
```

## Still Not Working?

If it still fails after all steps:

1. **Share the debug endpoint output** - This shows exactly what's happening
2. **Share Vercel logs** - The detailed comparison will show why tokens don't match
3. **Check**: Is the URL correct? Does it include `https://` and end with `/api/webhooks/whatsapp`?

## Quick Test Command

Test the webhook endpoint manually:
```bash
curl "https://your-app.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx&hub.challenge=test123"
```

**Expected**: Should return `test123` as plain text (not JSON)

**If it returns JSON error**: Check the error message - it will tell you what's wrong.

