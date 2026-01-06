# Dev Cache Reset Guide

If you encounter `.next` runtime errors like "Cannot find module './xxxx.js'", follow these steps:

## Quick Fix

```bash
# Stop dev server (Ctrl+C)

# Clean build artifacts
rm -rf .next
rm -rf node_modules/.cache

# Reinstall dependencies
npm install

# Regenerate Prisma client
npx prisma generate

# Restart dev server
npm run dev
```

## Automated Script

Run the reset script:

```bash
bash scripts/dev-reset.sh
```

## Why This Happens

Next.js caches compiled modules in `.next` directory. Sometimes this cache becomes corrupted, especially after:
- Dependency updates
- Schema changes
- Build process interruptions
- File system issues

## Prevention

- Never commit `.next` directory (already in `.gitignore`)
- Run `npm run build` before committing to catch issues early
- If you see module errors, reset cache immediately








