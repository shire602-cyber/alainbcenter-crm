# Fix Build Error: Missing _document.js

## Problem
The error `ENOENT: no such file or directory C:\Users\arahm\alainbcenter-crm\.next\server\pages\_document.js` indicates a corrupted or incomplete Next.js build.

## Solution

### Step 1: Stop the Dev Server
1. In your terminal where `npm run dev` is running, press `Ctrl+C` to stop it
2. Wait a few seconds for it to fully stop

### Step 2: Delete Build Cache
Open PowerShell in the project directory and run:

```powershell
# Delete .next directory
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

# Delete node_modules/.cache if it exists
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
```

If you get "access denied" errors, close any editors/terminals that might have the files open, then try again.

### Step 3: Rebuild
```powershell
# Regenerate Prisma client
npx prisma generate

# Start dev server (this will rebuild automatically)
npm run dev
```

### Alternative: Full Clean Rebuild
If the above doesn't work:

```powershell
# Stop dev server first (Ctrl+C)

# Delete build artifacts
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue

# Reinstall dependencies (optional, only if needed)
# npm install

# Regenerate Prisma
npx prisma generate

# Start fresh
npm run dev
```

## What Was Fixed
- ✅ Fixed `toast()` function calls in `RenewalRevenueCard.tsx` - all now use `showToast()` correctly
- ✅ All toast notifications now use the correct API

After rebuilding, the server should start without errors.


# Fix Build Error: Missing _document.js

## Problem
The error `ENOENT: no such file or directory C:\Users\arahm\alainbcenter-crm\.next\server\pages\_document.js` indicates a corrupted or incomplete Next.js build.

## Solution

### Step 1: Stop the Dev Server
1. In your terminal where `npm run dev` is running, press `Ctrl+C` to stop it
2. Wait a few seconds for it to fully stop

### Step 2: Delete Build Cache
Open PowerShell in the project directory and run:

```powershell
# Delete .next directory
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

# Delete node_modules/.cache if it exists
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
```

If you get "access denied" errors, close any editors/terminals that might have the files open, then try again.

### Step 3: Rebuild
```powershell
# Regenerate Prisma client
npx prisma generate

# Start dev server (this will rebuild automatically)
npm run dev
```

### Alternative: Full Clean Rebuild
If the above doesn't work:

```powershell
# Stop dev server first (Ctrl+C)

# Delete build artifacts
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue

# Reinstall dependencies (optional, only if needed)
# npm install

# Regenerate Prisma
npx prisma generate

# Start fresh
npm run dev
```

## What Was Fixed
- ✅ Fixed `toast()` function calls in `RenewalRevenueCard.tsx` - all now use `showToast()` correctly
- ✅ All toast notifications now use the correct API

After rebuilding, the server should start without errors.














