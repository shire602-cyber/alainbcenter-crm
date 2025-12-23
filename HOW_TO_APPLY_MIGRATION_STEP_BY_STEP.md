# 📍 Step-by-Step: Apply Migration (Method 1)

## Where to Click - Visual Guide

### Step 1: Get Your App URL

1. **In Vercel Dashboard** (where you are now):
   - Look at the **top navigation bar**
   - Click on **"Deployments"** tab (2nd tab from left)
   
2. **On Deployments page:**
   - You'll see a list of deployments
   - Find the **latest deployment** (usually at the top)
   - Look for a **URL** like: `https://alainbcenter-xxxxx.vercel.app`
   - **Copy this URL**

### Step 2: Open Migration Endpoint

1. **Open a new browser tab**
2. **Type or paste** your app URL
3. **Add** `/api/admin/migrate` to the end

**Example:**
```
https://alainbcenter-xxxxx.vercel.app/api/admin/migrate
```

4. **Press Enter**

### Step 3: What You'll See

**If migration works:**
```json
{
  "success": true,
  "message": "Migration applied successfully",
  "columnsAdded": ["infoSharedAt", "quotationSentAt", "lastInfoSharedType"]
}
```

**If already applied:**
```json
{
  "success": true,
  "message": "Migration already applied",
  "existingColumns": ["infoSharedAt", "quotationSentAt", "lastInfoSharedType"]
}
```

---

## Alternative: Use SQL Directly (Faster)

If the endpoint doesn't work, use **Method 2** - run SQL directly:

### In Your Current Screen (Storage Tab):

1. **Click on your database name** (the one showing in the Storage tab)
2. Look for **"Query"** or **"SQL Editor"** button
3. **Click it**
4. **Paste this SQL:**
```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```
5. **Click "Run" or "Execute"**

---

## Quick Summary

**Method 1 (Endpoint):**
- Go to **Deployments** tab → Copy app URL → Add `/api/admin/migrate` → Visit in browser

**Method 2 (SQL - Faster):**
- Stay on **Storage** tab → Click database → Click "Query" → Paste SQL → Run

**Method 2 is faster if you're already on the Storage tab!** ⚡
