# PowerShell script to clear Next.js build cache
# Run this script after stopping the dev server

Write-Host "Stopping any Node.js processes in this directory..." -ForegroundColor Yellow

# Find and stop Node processes that might be using .next
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*nodejs*" -or $_.Path -like "*nvm*"
}

if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js processes. Please stop the dev server manually (Ctrl+C in the terminal running 'npm run dev')" -ForegroundColor Yellow
    Write-Host "Press any key after stopping the dev server to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

Write-Host "`nAttempting to delete .next directory..." -ForegroundColor Cyan

# Try to delete .next directory
Start-Sleep -Seconds 2

if (Test-Path .next) {
    try {
        # Delete files first
        Get-ChildItem .next -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        }
        
        # Delete directories
        Get-ChildItem .next -Recurse -Directory -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object {
            Remove-Item $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
        }
        
        # Finally delete .next itself
        Remove-Item .next -Force -Recurse -ErrorAction SilentlyContinue
        
        if (Test-Path .next) {
            Write-Host "`n❌ Could not fully delete .next directory. Some files are still locked." -ForegroundColor Red
            Write-Host "`nPlease:" -ForegroundColor Yellow
            Write-Host "1. Make sure 'npm run dev' is stopped (Ctrl+C)" -ForegroundColor Yellow
            Write-Host "2. Close any editors/terminals that might have files open" -ForegroundColor Yellow
            Write-Host "3. Try running this script again" -ForegroundColor Yellow
            Write-Host "`nOr manually delete the .next folder using File Explorer" -ForegroundColor Yellow
        } else {
            Write-Host "`n✅ Successfully deleted .next directory!" -ForegroundColor Green
            Write-Host "`nYou can now run: npm run dev" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "`n❌ Error: $_" -ForegroundColor Red
        Write-Host "`nTry manually deleting the .next folder using File Explorer" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n✅ .next directory doesn't exist (already deleted or never created)" -ForegroundColor Green
}

Write-Host "`nDone!" -ForegroundColor Cyan


# PowerShell script to clear Next.js build cache
# Run this script after stopping the dev server

Write-Host "Stopping any Node.js processes in this directory..." -ForegroundColor Yellow

# Find and stop Node processes that might be using .next
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*nodejs*" -or $_.Path -like "*nvm*"
}

if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js processes. Please stop the dev server manually (Ctrl+C in the terminal running 'npm run dev')" -ForegroundColor Yellow
    Write-Host "Press any key after stopping the dev server to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

Write-Host "`nAttempting to delete .next directory..." -ForegroundColor Cyan

# Try to delete .next directory
Start-Sleep -Seconds 2

if (Test-Path .next) {
    try {
        # Delete files first
        Get-ChildItem .next -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        }
        
        # Delete directories
        Get-ChildItem .next -Recurse -Directory -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object {
            Remove-Item $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
        }
        
        # Finally delete .next itself
        Remove-Item .next -Force -Recurse -ErrorAction SilentlyContinue
        
        if (Test-Path .next) {
            Write-Host "`n❌ Could not fully delete .next directory. Some files are still locked." -ForegroundColor Red
            Write-Host "`nPlease:" -ForegroundColor Yellow
            Write-Host "1. Make sure 'npm run dev' is stopped (Ctrl+C)" -ForegroundColor Yellow
            Write-Host "2. Close any editors/terminals that might have files open" -ForegroundColor Yellow
            Write-Host "3. Try running this script again" -ForegroundColor Yellow
            Write-Host "`nOr manually delete the .next folder using File Explorer" -ForegroundColor Yellow
        } else {
            Write-Host "`n✅ Successfully deleted .next directory!" -ForegroundColor Green
            Write-Host "`nYou can now run: npm run dev" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "`n❌ Error: $_" -ForegroundColor Red
        Write-Host "`nTry manually deleting the .next folder using File Explorer" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n✅ .next directory doesn't exist (already deleted or never created)" -ForegroundColor Green
}

Write-Host "`nDone!" -ForegroundColor Cyan














