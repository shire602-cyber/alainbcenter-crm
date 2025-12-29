# Security Guide - Secret Management & Git History

## ⚠️ CRITICAL: If Secrets Were Exposed

If database credentials, API keys, or tokens were committed to Git history, follow these steps:

### Option 1: Rewrite Git History (Recommended for Private Repos)

**⚠️ WARNING:** This rewrites history. Coordinate with all team members.

```bash
# Install git-filter-repo (if not installed)
pip install git-filter-repo

# Remove secrets from entire history
git filter-repo --path-glob '*.md' --invert-paths --replace-text <(echo 'postgresql://[REDACTED]==>postgresql://USERNAME:PASSWORD@HOST')
git filter-repo --replace-text <(echo 'DATABASE_URL=postgresql://[REDACTED]==>DATABASE_URL=')
git filter-repo --replace-text <(echo 'npg_[REDACTED]==>[REDACTED]')

# Force push (⚠️ DESTRUCTIVE - coordinate with team)
git push origin --force --all
git push origin --force --tags
```

### Option 2: Rotate All Secrets (Recommended for Public Repos)

If history rewrite isn't possible (public repo, shared history):

1. **Rotate Database Credentials:**
   - Go to Neon Dashboard → Your Project → Settings
   - Click "Reset Password" or "Regenerate Connection String"
   - Copy new `DATABASE_URL` and `DIRECT_URL`
   - Update Vercel Environment Variables immediately

2. **Rotate API Keys:**
   - WhatsApp: Meta Dashboard → WhatsApp → API Setup → Regenerate Access Token
   - OpenAI: OpenAI Dashboard → API Keys → Revoke old, create new
   - DeepSeek: DeepSeek Dashboard → API Keys → Regenerate

3. **Rotate Application Secrets:**
   - `CRON_SECRET`: Generate new random string
   - `JOB_RUNNER_TOKEN`: Generate new random string
   - `AUTH_SECRET`: Generate new random string
   - `SESSION_SECRET`: Generate new random string

4. **Update Vercel Environment Variables:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Update all rotated secrets
   - Redeploy application

5. **Verify Old Secrets Are Invalid:**
   - Test old database connection (should fail)
   - Test old API keys (should return 401/403)

## Current Security Status

✅ **No secrets in current codebase** - All use environment variables  
✅ **.gitignore configured** - `.env*` files are ignored  
✅ **Documentation uses placeholders** - No real credentials in docs

## Required Environment Variables

Set these in Vercel Dashboard → Environment Variables:

### Database
- `DATABASE_URL` - PostgreSQL connection string (pooler)
- `DIRECT_URL` - PostgreSQL direct connection (for migrations)

### Authentication
- `AUTH_SECRET` - NextAuth secret (generate: `openssl rand -base64 32`)
- `SESSION_SECRET` - Session encryption key (generate: `openssl rand -base64 32`)

### WhatsApp / Meta
- `WHATSAPP_ACCESS_TOKEN` - Meta Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` - Meta phone number ID
- `WHATSAPP_VERIFY_TOKEN` - Webhook verification token (your choice)
- `WHATSAPP_APP_SECRET` - Meta app secret (optional but recommended)
- `META_VERIFY_TOKEN` - Meta webhook verify token
- `META_APP_SECRET` - Meta app secret
- `META_PAGE_ACCESS_TOKEN` - Meta page access token

### Automation / Cron
- `CRON_SECRET` - Secret for cron endpoint auth (generate: `openssl rand -base64 32`)
- `JOB_RUNNER_TOKEN` - Secret for job runner auth (generate: `openssl rand -base64 32`)

### AI (Optional)
- `OPENAI_API_KEY` - OpenAI API key (for embeddings fallback)
- `DEEPSEEK_API_KEY` - DeepSeek API key (primary AI)

### Email (Optional)
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP port (usually 587)
- `SMTP_USER` - SMTP username
- `SMTP_PASSWORD` - SMTP password
- `SMTP_FROM` - From email address

## Generating Secure Secrets

```bash
# Generate random secrets
openssl rand -base64 32  # For CRON_SECRET, JOB_RUNNER_TOKEN, AUTH_SECRET, SESSION_SECRET

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use Vercel Environment Variables** for production
3. **Rotate secrets regularly** - Every 90 days for production
4. **Use different secrets** for development and production
5. **Monitor for exposed secrets** - Use GitHub secret scanning
6. **Document required env vars** - Keep `.env.example` updated

## Verification

After setting environment variables, verify they're loaded:

```bash
# Check Vercel logs for environment variable loading
# Look for: "✅ [PRISMA] Enhanced DATABASE_URL with connection pool parameters"
```

## Emergency Response

If secrets are exposed:

1. **Immediately rotate** all exposed credentials
2. **Update Vercel** environment variables
3. **Redeploy** application
4. **Notify team** if shared credentials
5. **Review access logs** for unauthorized access
6. **Consider history rewrite** if private repo

---

**Last Updated:** 2025-01-30  
**Status:** ✅ Secure - No secrets in repository

