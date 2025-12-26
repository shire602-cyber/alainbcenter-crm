# Fix Connection Pool with Vercel Neon Integration

## Issue
The `DATABASE_URL` in Vercel is **auto-generated** by the Neon integration, so you can't manually edit it to add connection pool parameters.

## Solution Options

### Option 1: Override DATABASE_URL Manually (Recommended)

Even though it's auto-generated, you can **override** it with a custom value:

1. In Vercel Dashboard → Settings → Environment Variables
2. Find `DATABASE_URL` (the one with the green 'R' icon from Neon integration)
3. Click the **three dots** (`...`) menu
4. Select **"Override"** or **"Edit"**
5. Paste the full connection string with pool parameters:
   ```
   postgresql://neondb_owner:npg_o3Pqr4FnOmsT@ep-raspy-hill-adlqrxgm-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&connection_limit=20&pool_timeout=20
   ```
6. Save

**Note:** This will override the auto-generated value. The integration will still show the green 'R' icon, but your custom value will be used.

### Option 2: Use POSTGRES_PRISMA_URL (If Available)

Vercel Neon integration sometimes creates `POSTGRES_PRISMA_URL` which is optimized for Prisma. Check if this variable exists and if it uses the pooler endpoint.

If it does, you can:
1. Update your code to use `POSTGRES_PRISMA_URL` instead of `DATABASE_URL` for Prisma
2. Or copy `POSTGRES_PRISMA_URL` value to `DATABASE_URL` (override)

### Option 3: Configure in Neon Dashboard

Some connection pool settings can be configured in Neon:

1. Go to Neon Dashboard → Your Project → Settings
2. Check for "Connection Pooling" or "Pooler" settings
3. Enable/configure connection pooling there
4. The integration might pick up the changes automatically

### Option 4: Update Prisma Client to Use Pool Parameters

We've already updated `src/lib/prisma.ts` to be aware of connection pooling. However, Prisma doesn't directly support connection pool parameters in the client constructor - they need to be in the DATABASE_URL.

## Recommended Action

**Use Option 1** - Override the auto-generated `DATABASE_URL`:

1. The connection string you have from Neon dashboard is correct
2. Add the connection pool parameters: `&connection_limit=20&pool_timeout=20`
3. Override the auto-generated value in Vercel
4. Redeploy

## Verify After Update

After overriding and redeploying:
- Check Vercel logs for connection pool timeout errors (should be gone)
- Monitor webhook processing success rate
- Verify concurrent requests are handled properly

## Important Notes

- Overriding the auto-generated value won't break the Neon integration
- The integration will still manage other variables (POSTGRES_USER, PGHOST, etc.)
- You'll need to manually update if Neon changes the connection string
- Consider documenting the override in your project notes

