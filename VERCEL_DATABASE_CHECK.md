# How to Check and Fix DATABASE_URL in Vercel

## Step 1: Check Your Current DATABASE_URL

1. Go to **Vercel Dashboard** → Your Project
2. Click **Settings** → **Environment Variables**
3. Find `DATABASE_URL` in the list
4. Check what it says:

### ✅ If it looks like this (PostgreSQL):
```
postgresql://user:password@host:port/database?sslmode=require
```
**OR**
```
postgres://user:password@host:port/database
```

**Then you're good!** Just redeploy:
- Go to **Deployments** tab
- Click **"..."** on the latest deployment
- Click **"Redeploy"**

### ❌ If it looks like this (SQLite - WRONG):
```
file:./prisma/dev.db
```
**OR**
```
file://./prisma/dev.db
```

**Then you need to change it!** See Step 2 below.

---

## Step 2: If You Need to Change It

### Option A: Use Vercel Postgres (Easiest)

1. In Vercel Dashboard → Your Project
2. Go to **Storage** tab
3. Click **"Create Database"** → Select **Postgres**
4. Choose a name and region
5. Click **"Create"**
6. Once created, click on the database
7. Copy the **Connection String** (it will look like `postgresql://...`)
8. Go to **Settings** → **Environment Variables**
9. Find `DATABASE_URL` and click **Edit**
10. Paste the PostgreSQL connection string
11. Make sure it's set for **Production** environment
12. Click **Save**
13. **Redeploy** your project

### Option B: Use External Database

If you already have a PostgreSQL database (Neon, Supabase, Railway, etc.):

1. Get your connection string from your database provider
2. Go to Vercel → **Settings** → **Environment Variables**
3. Edit `DATABASE_URL`
4. Paste your PostgreSQL connection string
5. Click **Save**
6. **Redeploy** your project

---

## Step 3: After Redeploying

After Vercel redeploys (wait 2-3 minutes), the app should work!

The error you saw was because:
- The code was trying to use SQLite (`file:./prisma/dev.db`)
- But Vercel can't use SQLite files in serverless
- Now the code uses PostgreSQL, which works in Vercel

---

## Quick Check

**If your DATABASE_URL in Vercel starts with:**
- ✅ `postgresql://` or `postgres://` → **You're good! Just redeploy.**
- ❌ `file://` or `file:` → **You need to change it to PostgreSQL (see Step 2)**

