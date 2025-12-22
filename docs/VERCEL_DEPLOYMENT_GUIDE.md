# Vercel Deployment Guide

**Complete step-by-step guide to deploy Alain Business Center CRM to Vercel**

---

## Prerequisites

- ✅ Production build successful
- ✅ Code committed to Git
- ✅ GitHub account (or GitLab/Bitbucket)
- ✅ Vercel account (free tier works)

---

## Step 1: Prepare Your Code

### 1.1: Ensure Code is Committed

```bash
# Check git status
git status

# If there are uncommitted changes:
git add .
git commit -m "Production build ready for Vercel deployment"
git push origin main
```

### 1.2: Verify Build Works

```bash
npm run build
```

If build succeeds, you're ready to deploy!

---

## Step 2: Set Up Vercel Account

1. Go to https://vercel.com
2. Sign up/Login (use GitHub for easiest integration)
3. Authorize Vercel to access your repositories

---

## Step 3: Deploy via Vercel Dashboard

### 3.1: Import Project

1. Click **"Add New Project"** in Vercel dashboard
2. Select your repository (`alainbcenter-crm`)
3. Click **"Import"**

### 3.2: Configure Project Settings

**Framework Preset:** Next.js (auto-detected)

**Build Settings:**
- **Root Directory:** `./` (default)
- **Build Command:** `npm run build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `npm install` (default)

**Environment Variables:** (We'll add these in the next step)

### 3.3: Add Environment Variables

**Before clicking Deploy**, add these environment variables in Vercel:

#### Required Variables:

```
DATABASE_URL=file:./prisma/prod.db
NODE_ENV=production
```

**⚠️ Important:** For production, you should use a proper database (PostgreSQL, MySQL) instead of SQLite. See "Database Options" below.

#### Authentication:

```
AUTH_SECRET=<generate-secure-random-string>
```

**Generate AUTH_SECRET:**
```bash
# Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# Mac/Linux:
openssl rand -base64 32
```

#### Optional (for integrations):

```
# WhatsApp (if using)
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_id
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_APP_SECRET=your_app_secret

# Meta/Facebook (if using)
META_VERIFY_TOKEN=your_token
META_APP_SECRET=your_secret
META_PAGE_ACCESS_TOKEN=your_token

# Automation/Cron
CRON_SECRET=your_secure_random_string

# AI Features (if using)
OPENAI_API_KEY=your_key

# Email (if using)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_password
SMTP_FROM=noreply@alainbcenter.com
```

**How to add in Vercel:**
1. In project settings, go to **"Environment Variables"**
2. Click **"Add"** for each variable
3. Select environment: **Production**, **Preview**, and/or **Development**
4. Click **"Save"**

### 3.4: Deploy

1. Click **"Deploy"** button
2. Wait for build to complete (2-5 minutes)
3. Your app will be live at: `your-project-name.vercel.app`

---

## Step 4: Database Setup

### Option A: Use Vercel Postgres (Recommended)

1. In Vercel dashboard, go to **Storage** tab
2. Click **"Create Database"** → Select **Postgres**
3. Choose a name and region
4. Copy the connection string
5. Update `DATABASE_URL` in environment variables:
   ```
   DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
   ```
6. Update `prisma/schema.prisma` to use PostgreSQL:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
7. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

### Option B: Use External Database

**Recommended providers:**
- **Supabase** (free tier available): https://supabase.com
- **Railway** (free tier): https://railway.app
- **PlanetScale** (MySQL, free tier): https://planetscale.com
- **Neon** (PostgreSQL, free tier): https://neon.tech

**Steps:**
1. Create database on your chosen provider
2. Get connection string
3. Add `DATABASE_URL` to Vercel environment variables
4. Update `prisma/schema.prisma` if needed (PostgreSQL vs MySQL)
5. Run migrations:
   ```bash
   DATABASE_URL="your_prod_db_url" npx prisma migrate deploy
   ```

### Option C: Keep SQLite (Not Recommended for Production)

⚠️ **Warning:** SQLite doesn't work well on Vercel's serverless functions. Use only for testing.

If you must use SQLite:
1. Use a file storage service (e.g., Cloudflare R2, AWS S3)
2. Download database file on each function invocation
3. This is complex and not recommended

---

## Step 5: Post-Deployment Setup

### 5.1: Seed Initial Data

After deployment, you need to seed your database. You can do this via:

**Option 1: Vercel CLI (Recommended)**

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link to your project
vercel link

# Run seed scripts (pointing to production DB)
DATABASE_URL="your_prod_db_url" npx tsx scripts/create-admin.ts
DATABASE_URL="your_prod_db_url" npx tsx scripts/seed-document-requirements.ts
DATABASE_URL="your_prod_db_url" npx tsx scripts/seed-automation-rules.ts
```

**Option 2: Create API Endpoint for Seeding**

Create a one-time seed endpoint (remove after use):

```typescript
// src/app/api/admin/seed/route.ts
// Add authentication and run seed scripts
```

### 5.2: Apply Database Indexes

If you created performance indexes, apply them:

```bash
# For PostgreSQL:
psql your_database_url < prisma/migrations/add_performance_indexes.sql

# Or use Prisma Studio to execute SQL
```

---

## Step 6: Configure Custom Domain (Optional)

1. In Vercel dashboard → **Settings** → **Domains**
2. Add your domain (e.g., `crm.alainbcenter.com`)
3. Follow DNS configuration instructions
4. Vercel automatically provisions SSL certificate

---

## Step 7: Set Up Vercel Cron Jobs

Your `vercel.json` already has cron configuration:

```json
{
  "crons": [
    {
      "path": "/api/automation/run-daily",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**To enable:**
1. Vercel automatically detects cron jobs in `vercel.json`
2. Make sure `CRON_SECRET` environment variable is set
3. Protect your cron endpoint with the secret

---

## Step 8: Verify Deployment

### 8.1: Test Your Live Site

Visit your Vercel URL and test:
- [ ] Homepage loads
- [ ] Login page works
- [ ] Can log in (create admin user first if needed)
- [ ] Dashboard displays
- [ ] Leads page works
- [ ] API endpoints respond

### 8.2: Check Logs

In Vercel dashboard → **Deployments** → Click on deployment → **Logs**

Look for:
- ✅ Build successful
- ✅ No runtime errors
- ✅ Database connection working

---

## Step 9: Security Checklist

Before going live:

- [ ] Change default admin password
- [ ] All environment variables set (no secrets in code)
- [ ] HTTPS enabled (automatic on Vercel)
- [ ] Database credentials secure
- [ ] `CRON_SECRET` set and used
- [ ] Error pages don't expose stack traces

---

## Troubleshooting

### Build Fails

**Error: "Module not found"**
- Check that all dependencies are in `package.json`
- Run `npm install` locally to verify

**Error: "TypeScript errors"**
- Fix TypeScript errors locally first
- Run `npm run build` locally to catch errors

### Runtime Errors

**Error: "Database connection failed"**
- Verify `DATABASE_URL` is correct
- Check database is accessible from Vercel
- For PostgreSQL, ensure SSL is enabled

**Error: "Prisma client not generated"**
- Add to `package.json` scripts:
  ```json
  "postinstall": "prisma generate"
  ```
- Or add build command: `npm install && npx prisma generate && npm run build`

### Environment Variables Not Working

- Make sure variables are set for **Production** environment
- Redeploy after adding variables
- Check variable names match exactly (case-sensitive)

---

## Quick Reference

### Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

### Update Environment Variables

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Add/Edit variables
3. Redeploy (or wait for auto-deploy on next push)

### View Logs

```bash
# Via CLI
vercel logs

# Or in dashboard
Vercel Dashboard → Deployments → Click deployment → Logs
```

---

## Next Steps After Deployment

1. ✅ **Monitor**: Check Vercel dashboard for errors
2. ✅ **Test**: Verify all features work
3. ✅ **Backup**: Set up database backups
4. ✅ **Monitor**: Set up error tracking (Sentry, etc.)
5. ✅ **Document**: Update team on production URL

---

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Support: https://vercel.com/support
- Project Issues: Check deployment logs in Vercel dashboard

---

**Status**: Ready to deploy! 🚀


