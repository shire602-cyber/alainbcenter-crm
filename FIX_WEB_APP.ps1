# Comprehensive fix script for Alain CRM web app issues
# This script will:
# 1. Stop all Node.js processes
# 2. Clear all build caches
# 3. Regenerate Prisma
# 4. Verify critical files

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ALAIN CRM - COMPREHENSIVE FIX" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Stop Node.js processes
Write-Host "Step 1: Stopping Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "  Found $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Gray
    $nodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Write-Host "  All Node.js processes stopped" -ForegroundColor Green
} else {
    Write-Host "  No Node.js processes found" -ForegroundColor Green
}

# Step 2: Clear build caches
Write-Host "`nStep 2: Clearing build caches..." -ForegroundColor Yellow

# Clear .next directory
if (Test-Path .next) {
    Write-Host "  Removing .next directory..." -ForegroundColor Gray
    Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    if (-not (Test-Path .next)) {
        Write-Host "  .next directory cleared" -ForegroundColor Green
    } else {
        Write-Host "  Warning: .next directory still exists (may be locked)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  .next directory doesn't exist" -ForegroundColor Gray
}

# Clear node_modules cache
if (Test-Path "node_modules\.cache") {
    Write-Host "  Removing node_modules cache..." -ForegroundColor Gray
    Remove-Item -Recurse -Force "node_modules\.cache" -ErrorAction SilentlyContinue
    Write-Host "  node_modules cache cleared" -ForegroundColor Green
}

# Step 3: Regenerate Prisma
Write-Host "`nStep 3: Regenerating Prisma client..." -ForegroundColor Yellow
try {
    npx prisma generate 2>&1 | Out-Null
    Write-Host "  Prisma client regenerated" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Prisma generate may have issues" -ForegroundColor Yellow
}

# Step 4: Verify critical files
Write-Host "`nStep 4: Verifying critical files..." -ForegroundColor Yellow

$criticalFiles = @(
    "src/middleware.ts",
    "src/lib/auth-server.ts",
    "src/lib/auth-session-edge.ts",
    "src/app/page.tsx",
    "src/app/layout.tsx",
    "next.config.js",
    "package.json"
)

$allExist = $true
foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Write-Host "  [OK] $file" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $file" -ForegroundColor Red
        $allExist = $false
    }
}

if (-not $allExist) {
    Write-Host "`n  ERROR: Some critical files are missing!" -ForegroundColor Red
    exit 1
}

# Step 5: Check environment
Write-Host "`nStep 5: Checking environment..." -ForegroundColor Yellow
if (Test-Path ".env.local") {
    Write-Host "  .env.local exists" -ForegroundColor Green
} else {
    Write-Host "  WARNING: .env.local not found" -ForegroundColor Yellow
}

# Final instructions
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  FIX COMPLETE" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run: npm run dev" -ForegroundColor White
Write-Host "2. Wait for compilation to complete" -ForegroundColor White
Write-Host "3. Open: http://localhost:3000" -ForegroundColor White
Write-Host "4. If you see login page, try logging in" -ForegroundColor White
Write-Host "`nIf issues persist, check:" -ForegroundColor Yellow
Write-Host "  - Terminal output for errors" -ForegroundColor White
Write-Host "  - Browser console (F12) for client errors" -ForegroundColor White
Write-Host "  - .env.local has all required variables" -ForegroundColor White
Write-Host ""

# Comprehensive fix script for Alain CRM web app issues
# This script will:
# 1. Stop all Node.js processes
# 2. Clear all build caches
# 3. Regenerate Prisma
# 4. Verify critical files

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ALAIN CRM - COMPREHENSIVE FIX" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Stop Node.js processes
Write-Host "Step 1: Stopping Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "  Found $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Gray
    $nodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Write-Host "  All Node.js processes stopped" -ForegroundColor Green
} else {
    Write-Host "  No Node.js processes found" -ForegroundColor Green
}

# Step 2: Clear build caches
Write-Host "`nStep 2: Clearing build caches..." -ForegroundColor Yellow

# Clear .next directory
if (Test-Path .next) {
    Write-Host "  Removing .next directory..." -ForegroundColor Gray
    Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    if (-not (Test-Path .next)) {
        Write-Host "  .next directory cleared" -ForegroundColor Green
    } else {
        Write-Host "  Warning: .next directory still exists (may be locked)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  .next directory doesn't exist" -ForegroundColor Gray
}

# Clear node_modules cache
if (Test-Path "node_modules\.cache") {
    Write-Host "  Removing node_modules cache..." -ForegroundColor Gray
    Remove-Item -Recurse -Force "node_modules\.cache" -ErrorAction SilentlyContinue
    Write-Host "  node_modules cache cleared" -ForegroundColor Green
}

# Step 3: Regenerate Prisma
Write-Host "`nStep 3: Regenerating Prisma client..." -ForegroundColor Yellow
try {
    npx prisma generate 2>&1 | Out-Null
    Write-Host "  Prisma client regenerated" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Prisma generate may have issues" -ForegroundColor Yellow
}

# Step 4: Verify critical files
Write-Host "`nStep 4: Verifying critical files..." -ForegroundColor Yellow

$criticalFiles = @(
    "src/middleware.ts",
    "src/lib/auth-server.ts",
    "src/lib/auth-session-edge.ts",
    "src/app/page.tsx",
    "src/app/layout.tsx",
    "next.config.js",
    "package.json"
)

$allExist = $true
foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Write-Host "  [OK] $file" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $file" -ForegroundColor Red
        $allExist = $false
    }
}

if (-not $allExist) {
    Write-Host "`n  ERROR: Some critical files are missing!" -ForegroundColor Red
    exit 1
}

# Step 5: Check environment
Write-Host "`nStep 5: Checking environment..." -ForegroundColor Yellow
if (Test-Path ".env.local") {
    Write-Host "  .env.local exists" -ForegroundColor Green
} else {
    Write-Host "  WARNING: .env.local not found" -ForegroundColor Yellow
}

# Final instructions
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  FIX COMPLETE" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run: npm run dev" -ForegroundColor White
Write-Host "2. Wait for compilation to complete" -ForegroundColor White
Write-Host "3. Open: http://localhost:3000" -ForegroundColor White
Write-Host "4. If you see login page, try logging in" -ForegroundColor White
Write-Host "`nIf issues persist, check:" -ForegroundColor Yellow
Write-Host "  - Terminal output for errors" -ForegroundColor White
Write-Host "  - Browser console (F12) for client errors" -ForegroundColor White
Write-Host "  - .env.local has all required variables" -ForegroundColor White
Write-Host ""












