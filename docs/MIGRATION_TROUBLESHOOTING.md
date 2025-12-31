# Migration Troubleshooting Guide

## "postgres message too large" Error

If you encounter this error when running `npx prisma migrate deploy` or `npx prisma migrate status`:

### Solution

Use the binary query engine:

```bash
PRISMA_CLI_QUERY_ENGINE_TYPE=binary npx prisma migrate deploy
```

Or set it permanently in your environment:

```bash
export PRISMA_CLI_QUERY_ENGINE_TYPE=binary
npx prisma migrate deploy
```

### Why This Happens

Prisma can use different query engines:
- **Library** (default): Can have issues with large database schemas
- **Binary**: More reliable for complex schemas and migrations

### Alternative: Check Migration Status

If migrations are already applied, you can verify:

```bash
PRISMA_CLI_QUERY_ENGINE_TYPE=binary npx prisma migrate status
```

This should show: "Database schema is up to date!"

## Migration Timeout Issues

### Use DIRECT_URL for Neon

For Neon databases, use a non-pooled connection for migrations:

1. Add to `.env`:
   ```
   DIRECT_URL=postgresql://user:pass@host.region.aws.neon.tech/db?sslmode=require
   ```
   (Remove `-pooler` from the hostname)

2. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```

## Invalid Migration Directories

If you see migration directories with shell command names like `$(date +%Y%m%d%H%M%S)_name`:

```bash
# Remove invalid directories
rm -rf "prisma/migrations/\$(date +%Y%m%d%H%M%S)_*"
```

Migration directories should have proper timestamps like `20251231184412_name`.

