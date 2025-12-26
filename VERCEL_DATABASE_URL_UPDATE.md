# Update Vercel DATABASE_URL with Neon Pooler

## Current Connection String (from Neon Dashboard)

From your Neon dashboard, you have:
```
postgresql://neondb_owner:****@ep-raspy-hill-adlqrxgm-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

**✅ This is already using the pooler endpoint** (`-pooler` in the hostname), which is perfect!

## Steps to Update Vercel

### 1. Get Full Connection String from Neon

1. In Neon dashboard, click **"Show password"** to reveal the full connection string
2. Copy the complete connection string (with actual password)

### 2. Update Vercel Environment Variable

1. Go to **Vercel Dashboard** → Your Project (`alainbcenter-crm`)
2. Navigate to **Settings** → **Environment Variables**
3. Find `DATABASE_URL` in the list
4. Click **Edit** (or **Add** if it doesn't exist)
5. Paste the full connection string from Neon
6. Make sure it includes:
   - The `-pooler` endpoint (you already have this ✅)
   - The full password (click "Show password" in Neon)
   - `?sslmode=require` (already included ✅)

### 3. Recommended: Add Connection Pool Parameters

For better performance, add these parameters to the connection string:

```
?sslmode=require&channel_binding=require&connection_limit=20&pool_timeout=20
```

**Full example:**
```
postgresql://neondb_owner:YOUR_PASSWORD@ep-raspy-hill-adlqrxgm-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&connection_limit=20&pool_timeout=20
```

### 4. Apply to All Environments

- Select **Production**, **Preview**, and **Development** environments
- Click **Save**

### 5. Redeploy

After updating the environment variable:
1. Go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment
3. Or push a new commit to trigger automatic deployment

## Verify the Fix

After redeployment, monitor:
- ✅ No more connection pool timeout errors
- ✅ Webhook processing completes successfully
- ✅ Multiple concurrent requests handled properly

## Important Notes

- **Never commit the DATABASE_URL with password to git** - it's only in Vercel environment variables
- The pooler endpoint (`-pooler`) is essential for serverless functions
- Connection pool parameters help handle concurrent requests better

