# Database Migration Instructions

## Problem
The new auto-reply fields (`autoReplyEnabled`, `allowOutsideHours`, etc.) and `Reminder` model don't exist in your database yet, causing errors when messages arrive.

## Solution: Run Migration

You have **3 options** to run the migration:

### Option 1: Run via Vercel CLI (Recommended)

If you have Vercel CLI installed:

```bash
# Connect to your Vercel project
vercel link

# Run migration using Vercel's database connection
vercel env pull .env.local
npx prisma migrate deploy
```

### Option 2: Run SQL Directly on Vercel Postgres

1. Go to your Vercel dashboard
2. Navigate to your project → Settings → Environment Variables
3. Copy your `DATABASE_URL` (starts with `postgresql://`)
4. Run the migration SQL file:

```bash
# Option A: Using psql (if you have PostgreSQL client)
psql $DATABASE_URL -f prisma/migrations/add_auto_reply_and_reminders.sql

# Option B: Using a PostgreSQL GUI tool (pgAdmin, DBeaver, etc.)
# Open the SQL file and run it against your Vercel Postgres database
```

### Option 3: Run via Prisma Studio (if accessible)

```bash
# Set DATABASE_URL to your Vercel Postgres URL
export DATABASE_URL="postgresql://..."
npx prisma migrate deploy
```

## Quick Fix: Run SQL Directly

The simplest way is to copy the SQL from `prisma/migrations/add_auto_reply_and_reminders.sql` and run it directly in your Vercel Postgres database:

1. Go to Vercel Dashboard → Your Project → Storage → Postgres
2. Click "Connect" or "Open in Browser" (if available)
3. Run this SQL:

```sql
-- Add auto-reply fields to Lead table
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "autoReplyMode" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "mutedUntil" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastAutoReplyAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "allowOutsideHours" BOOLEAN NOT NULL DEFAULT false;

-- Create Reminder table
CREATE TABLE IF NOT EXISTS "Reminder" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "templateKey" TEXT,
    "message" TEXT,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- Add foreign key
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS "Reminder_leadId_scheduledAt_idx" ON "Reminder"("leadId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Reminder_sent_scheduledAt_idx" ON "Reminder"("sent", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Reminder_type_scheduledAt_idx" ON "Reminder"("type", "scheduledAt");
```

## Verify Migration

After running the migration, verify it worked:

```sql
-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'Lead' 
AND column_name IN ('autoReplyEnabled', 'allowOutsideHours', 'autoReplyMode', 'mutedUntil', 'lastAutoReplyAt');

-- Check if Reminder table exists
SELECT * FROM "Reminder" LIMIT 1;
```

## After Migration

Once the migration is complete:
1. Your app will automatically work - no restart needed
2. Inbound messages will trigger auto-reply (if enabled)
3. You can configure auto-reply settings on Lead detail pages
4. You can create reminders from Lead detail pages

## Need Help?

If you're stuck, you can also:
- Use Vercel's database dashboard (if available)
- Contact Vercel support for help accessing your Postgres database
- Use a tool like [Supabase](https://supabase.com) or [Neon](https://neon.tech) which provide web-based SQL editors

