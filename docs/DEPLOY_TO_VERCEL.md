# Deploy Phases 1-5 to Vercel - Quick Guide

## ✅ Code Status

**All Phases 1-5 code is implemented and ready!**

The code includes:
- ✅ Phase 1: AI Data Extraction
- ✅ Phase 2: Info/Quotation Detection  
- ✅ Phase 3: Follow-up Automation
- ✅ Phase 4: Agent Fallback
- ✅ Phase 5: Service Prompts

---

## 🚀 Deploy to Vercel

### Step 1: Commit Code (if not already)

```bash
git add .
git commit -m "Phases 1-5 implementation complete"
git push origin main
```

### Step 2: Database Setup

**Vercel requires PostgreSQL** (not SQLite).

**Option A: Vercel Postgres (Easiest)**
1. Vercel Dashboard → Storage → Create Database → Postgres
2. Copy connection string
3. Add to Environment Variables: `DATABASE_URL`

**Option B: External Database**
- Neon, Supabase, Railway, etc.
- Get connection string
- Add to Environment Variables: `DATABASE_URL`

### Step 3: Apply Migration

**After database is set up, apply the migration:**

```bash
# Set production DATABASE_URL
export DATABASE_URL="postgresql://user:pass@host:port/db?sslmode=require"

# Apply migration
npx prisma migrate deploy
```

**Or run SQL directly:**
```sql
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt");
```

### Step 4: Set Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

**Required:**
```
DATABASE_URL=postgresql://...
NODE_ENV=production
AUTH_SECRET=<generate-secret>
```

**For Phases 1-5:**
```
OPENAI_API_KEY=your_key (for AI features)
CRON_SECRET=your-secret (for automation)
```

### Step 5: Deploy

Vercel will auto-deploy when you push to main, or:
1. Go to Vercel Dashboard
2. Click "Redeploy"

### Step 6: Post-Deployment

**Seed Automation Rules:**
Visit as admin:
- `https://your-app.vercel.app/api/admin/automation/seed-info-followup`
- `https://your-app.vercel.app/api/admin/automation/seed-escalation`

---

## ✅ Verification

After deployment:

1. **Check migration:**
   - Log into database
   - Verify `infoSharedAt`, `quotationSentAt`, `lastInfoSharedType` columns exist

2. **Test functionality:**
   - Send test message → Check data extraction
   - Send "quotation" → Check `infoSharedAt` is set
   - Send "human agent" → Check task created

3. **Check automation:**
   - Visit `/automation` page
   - Verify rules are seeded
   - Check daily automation runs

---

## 📝 Important Notes

1. **Schema is PostgreSQL:** ✅ Already set correctly
2. **Migration needed:** Apply to production database
3. **Rules need seeding:** Run seed endpoints after deployment
4. **Cron jobs:** Already configured in `vercel.json`

---

## 🎉 Status

**Code:** ✅ Ready  
**Migration:** ⚠️ Needs to be applied to production DB  
**Deployment:** ✅ Ready to deploy  

**Once you apply the migration and seed the rules, everything will work!** 🚀
