# Vercel Environment Variables Configuration

**For Neon Database Deployment**

Copy these environment variables to Vercel Dashboard → Project Settings → Environment Variables

---

## Required Environment Variables

### Database Connection
```
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DATABASE?sslmode=require
DIRECT_URL=postgresql://USERNAME:PASSWORD@HOST.REGION.aws.neon.tech/DATABASE?sslmode=require
```
**⚠️ SECURITY:** 
- Get actual connection strings from Neon Dashboard → Connection Details
- Never commit real credentials to Git
- Use Vercel Environment Variables only

### Application Settings
```
NODE_ENV=production
```

### Authentication Secret
```
AUTH_SECRET=<generate-secure-random-string>
```

**Generate AUTH_SECRET:**
```powershell
# Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

---

## Optional Environment Variables

### Automation/Cron
```
CRON_SECRET=<generate-secure-random-string>
```

### WhatsApp Integration (if using)
```
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_id
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_APP_SECRET=your_app_secret
```

### Meta/Facebook Integration (if using)
```
META_VERIFY_TOKEN=your_token
META_APP_SECRET=your_secret
META_PAGE_ACCESS_TOKEN=your_token
```

### AI Features (if using)
```
OPENAI_API_KEY=your_key
```

### Email/SMTP (if using)
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_password
SMTP_FROM=noreply@alainbcenter.com
```

---

## How to Add in Vercel

1. Go to your project in Vercel Dashboard
2. Click **Settings** → **Environment Variables**
3. Click **Add** for each variable
4. Select environment: **Production** (and Preview/Development if needed)
5. Paste the value
6. Click **Save**

---

## Important Notes

- **Never commit** these values to Git
- Use **Production** environment for live site
- Use **Preview** for pull request previews
- Use **Development** for local development (optional)

---

**After adding variables, redeploy your project for changes to take effect.**


