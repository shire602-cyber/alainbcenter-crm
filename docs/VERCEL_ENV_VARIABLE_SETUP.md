# Set WhatsApp Verify Token in Vercel Environment Variables

## Quick Setup (2 minutes)

### Step 1: Go to Vercel Dashboard

1. Go to https://vercel.com
2. Select your project: **alainbcenter-crm**
3. Click **Settings** → **Environment Variables**

### Step 2: Add the Environment Variable

Click **Add New** and add:

**Key:**
```
WHATSAPP_VERIFY_TOKEN
```

**Value:**
```
wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx
```

**Environment:** Select **Production** (and **Preview** if you want)

Click **Save**

### Step 3: Redeploy

1. Go to **Deployments** tab
2. Click the **three dots** on the latest deployment
3. Click **Redeploy**
4. Wait 2-3 minutes for deployment to complete

### Step 4: Test

After deployment, test the webhook:

```
https://alainbcenter-4cu24c21f-abdurahmans-projects-66129df5.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx&hub.challenge=test123
```

**Expected:** Should return `test123` (plain text)

### Step 5: Configure in Meta

1. Go to Meta Business Manager → WhatsApp → Configuration → Webhooks
2. **Callback URL:** `https://alainbcenter-4cu24c21f-abdurahmans-projects-66129df5.vercel.app/api/webhooks/whatsapp`
3. **Verify Token:** `wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx`
4. Click **"Verify and Save"**

## Verify It's Set

Check the test endpoint (after redeploy):
```
https://alainbcenter-4cu24c21f-abdurahmans-projects-66129df5.vercel.app/api/webhooks/whatsapp/test-verify?full=true
```

Should show:
```json
{
  "verifyToken": "wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx",
  "source": "env_var"
}
```

## Notes

- ✅ Environment variables take priority over database
- ✅ More reliable for production
- ✅ No database dependency
- ✅ Updates immediately after redeploy

