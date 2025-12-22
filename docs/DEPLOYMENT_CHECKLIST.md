# Vercel Deployment Checklist

Use this checklist to ensure a smooth deployment process.

---

## Pre-Deployment

- [ ] Code is committed to Git
- [ ] Production build succeeds locally (`npm run build`)
- [ ] All tests pass (if applicable)
- [ ] No console errors in browser
- [ ] `.env` files are in `.gitignore` (already done ✅)

---

## Vercel Account Setup

- [ ] Created Vercel account
- [ ] Connected GitHub account
- [ ] Authorized Vercel to access repositories

---

## Project Deployment

- [ ] Imported project in Vercel
- [ ] Framework detected as Next.js
- [ ] Build settings configured correctly

---

## Environment Variables

### Required
- [ ] `DATABASE_URL` - Production database connection string
- [ ] `NODE_ENV=production`
- [ ] `AUTH_SECRET` - Generated secure random string

### Optional (if using features)
- [ ] `WHATSAPP_ACCESS_TOKEN`
- [ ] `WHATSAPP_PHONE_NUMBER_ID`
- [ ] `WHATSAPP_VERIFY_TOKEN`
- [ ] `WHATSAPP_APP_SECRET`
- [ ] `META_VERIFY_TOKEN`
- [ ] `META_APP_SECRET`
- [ ] `META_PAGE_ACCESS_TOKEN`
- [ ] `CRON_SECRET`
- [ ] `OPENAI_API_KEY`
- [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

---

## Database Setup

- [ ] Production database created (PostgreSQL/MySQL recommended)
- [ ] Database connection string added to `DATABASE_URL`
- [ ] Prisma schema updated if switching from SQLite
- [ ] Migrations run on production database (`npx prisma migrate deploy`)
- [ ] Prisma client generated (`npx prisma generate`)

---

## Initial Data Seeding

- [ ] Admin user created
- [ ] Document requirements seeded
- [ ] Automation rules seeded
- [ ] Database indexes applied (if applicable)

---

## Deployment Verification

- [ ] Build completed successfully in Vercel
- [ ] No errors in deployment logs
- [ ] Site accessible at Vercel URL
- [ ] Login page loads
- [ ] Can log in with admin credentials
- [ ] Dashboard displays correctly
- [ ] Leads page works
- [ ] Inbox page works
- [ ] API endpoints respond correctly
- [ ] No console errors in browser

---

## Post-Deployment

- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active (automatic on Vercel)
- [ ] Cron jobs working (check Vercel dashboard)
- [ ] Error monitoring set up (optional)
- [ ] Database backups configured
- [ ] Team notified of production URL

---

## Security

- [ ] Default admin password changed
- [ ] All secrets in environment variables (not in code)
- [ ] HTTPS enabled (automatic on Vercel)
- [ ] `CRON_SECRET` set and used
- [ ] Error pages don't expose sensitive info

---

## Documentation

- [ ] Production URL documented
- [ ] Environment variables documented
- [ ] Database credentials stored securely
- [ ] Team access configured

---

## Monitoring Setup (Optional but Recommended)

- [ ] Error tracking (Sentry, LogRocket, etc.)
- [ ] Uptime monitoring
- [ ] Performance monitoring
- [ ] Database monitoring

---

**Deployment Date:** _______________
**Deployed By:** _______________
**Production URL:** _______________

---

## Quick Commands Reference

```bash
# Generate AUTH_SECRET
openssl rand -base64 32

# Generate CRON_SECRET
openssl rand -base64 32

# Run migrations on production
DATABASE_URL="your_prod_url" npx prisma migrate deploy

# Seed admin user
DATABASE_URL="your_prod_url" npx tsx scripts/create-admin.ts

# Deploy via CLI
vercel --prod
```

---

**Status:** Ready to deploy when all items are checked ✅

