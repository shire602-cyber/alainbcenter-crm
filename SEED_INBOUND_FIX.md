# 🔧 Fix: HTTP 405 Error on Seed-Inbound Endpoint

## The Problem

You're getting **HTTP ERROR 405** (Method Not Allowed) when trying to access:
```
https://your-app.vercel.app/api/admin/automation/seed-inbound
```

## Why This Happens

The code has been updated to support GET requests, but **Vercel hasn't deployed the new code yet**. HTTP 405 means the server doesn't recognize the GET method.

## ✅ Solution

### Step 1: Wait for Vercel Deployment

I just pushed the code changes. Vercel will automatically deploy in 1-2 minutes.

**Check deployment status:**
1. Go to your Vercel dashboard
2. Check if there's a new deployment running
3. Wait until it says "Ready" (green checkmark)

### Step 2: Try Again After Deployment

Once Vercel finishes deploying (usually 1-2 minutes), try the URL again:
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

---

## Alternative: Use POST Method

If GET still doesn't work after deployment, you can use a tool like **Postman** or **curl** to send a POST request:

### Using curl (PowerShell):
```powershell
Invoke-RestMethod -Uri "https://your-app.vercel.app/api/admin/automation/seed-inbound" -Method POST
```

### Using Browser Extension:
Install a REST client extension (like "REST Client" for Chrome) and send a POST request to the same URL.

---

## What Gets Seeded

Once it works, these 4 automation rules will be created:

1. **New WhatsApp Enquiry** - Auto-replies to new leads
2. **Price Inquiry Response** - Auto-replies when customer asks about pricing  
3. **Renewal Detection** - Auto-replies when renewal keywords detected
4. **Hot Lead Instant Reply** - Auto-replies to hot leads (score >= 70)

---

## Status

- ✅ **Code Updated:** GET method support added
- ✅ **Code Pushed:** Changes pushed to GitHub
- ⏳ **Vercel Deployment:** In progress (wait 1-2 minutes)
- ⚠️ **Next Step:** Try the URL again after deployment completes

**Wait for Vercel to finish deploying, then try again!** 🚀
