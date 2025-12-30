# Local Migration Guide

## Running Migrations Locally

Yes, you can run migrations locally if you provide the database URL and secret.

### Option 1: Environment Variable (Temporary)

```bash
# Set the database URL
export DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require"

# Run migrations
npx prisma migrate deploy

# Or for development (creates new migrations)
npx prisma migrate dev
```

### Option 2: .env.local File (Recommended)

1. Create `.env.local` in the project root (this file is already in `.gitignore`):

```bash
# .env.local (DO NOT COMMIT THIS FILE)
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
DIRECT_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
```

2. Run migrations:

```bash
# Deploy existing migrations
npx prisma migrate deploy

# Or for development
npx prisma migrate dev
```

### Option 3: One-time Command

```bash
# Run with inline environment variable
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require" npx prisma migrate deploy
```

## Verification

After running migrations, verify they were applied:

```bash
# Check migration status
npx prisma migrate status

# Or connect to database and check
npx prisma studio
```

## Important Notes

1. **Never commit `.env.local`** - It's already in `.gitignore`
2. **Use production database URL** - Get it from Neon Dashboard → Connection String
3. **Run `npx prisma generate`** after schema changes:
   ```bash
   npx prisma generate
   ```

## Common Commands

```bash
# 1. Generate Prisma Client
npx prisma generate

# 2. Deploy migrations (production-safe)
npx prisma migrate deploy

# 3. Create new migration (development)
npx prisma migrate dev --name your_migration_name

# 4. Reset database (⚠️ DESTRUCTIVE - deletes all data)
npx prisma migrate reset

# 5. View database in Prisma Studio
npx prisma studio
```

## Troubleshooting

### Error: "P3006: Migration failed to apply"

This usually means the database is out of sync. Options:

1. **Reset and reapply** (⚠️ deletes all data):
   ```bash
   npx prisma migrate reset
   ```

2. **Mark migrations as applied** (if you've already applied them manually):
   ```bash
   npx prisma migrate resolve --applied <migration_name>
   ```

### Error: "Connection refused" or "Connection timeout"

- Check your `DATABASE_URL` is correct
- Verify database is accessible from your IP (check Neon Dashboard → Settings → IP Allowlist)
- Try using the pooler URL (ends with `-pooler.aws.neon.tech`)

### Error: "Schema drift detected"

This means your database schema doesn't match Prisma schema. Options:

1. **Sync database to schema** (⚠️ may lose data):
   ```bash
   npx prisma db push
   ```

2. **Create a migration** to fix the drift:
   ```bash
   npx prisma migrate dev --name fix_schema_drift
   ```

## Security Reminder

- ✅ `.env.local` is in `.gitignore` - safe to use
- ✅ Never commit database URLs or secrets
- ✅ Use environment variables, never hardcode credentials
- ✅ Rotate credentials if accidentally exposed


