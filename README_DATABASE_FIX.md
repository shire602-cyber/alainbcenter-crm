# Database Configuration Fix

## Issue
The error shows that Prisma is expecting a SQLite database URL starting with `file:`, but Vercel uses PostgreSQL.

## Solution

### For Vercel (Production):
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Set `DATABASE_URL` to a PostgreSQL connection string:
   ```
   DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
   ```
3. Update `prisma/schema.prisma` to use PostgreSQL (see below)

### For Local Development:
Keep using SQLite:
```
DATABASE_URL=file:./prisma/dev.db
```

## Quick Fix: Update Schema

Change `prisma/schema.prisma` from:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

To:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Note:** This will require running migrations on your PostgreSQL database.

