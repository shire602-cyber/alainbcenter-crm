# Force clear Next.js build cache by killing Node processes
# WARNING: This will stop ALL Node.js processes on your system

Write-Host "=== FORCE CLEAR BUILD CACHE ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Find Node processes
Write-Host "Finding Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js process(es):" -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        Write-Host "  - PID: $($_.Id) | Path: $($_.Path)" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
    
    # Kill all Node processes
    $nodeProcesses | ForEach-Object {
        try {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  ✓ Stopped PID $($_.Id)" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ Failed to stop PID $($_.Id)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "Waiting 3 seconds for processes to fully terminate..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
} else {
    Write-Host "No Node.js processes found." -ForegroundColor Green
}

Write-Host ""
Write-Host "Attempting to delete .next directory..." -ForegroundColor Cyan

# Step 2: Try to delete .next
if (Test-Path .next) {
    try {
        # Delete files first
        Write-Host "  Deleting files..." -ForegroundColor Gray
        Get-ChildItem .next -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        }
        
        # Delete directories (deepest first)
        Write-Host "  Deleting directories..." -ForegroundColor Gray
        Get-ChildItem .next -Recurse -Directory -ErrorAction SilentlyContinue | 
            Sort-Object FullName -Descending | ForEach-Object {
                Remove-Item $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
            }
        
        # Finally delete .next itself
        Write-Host "  Deleting .next folder..." -ForegroundColor Gray
        Remove-Item .next -Force -Recurse -ErrorAction SilentlyContinue
        
        Start-Sleep -Seconds 1
        
        if (Test-Path .next) {
            Write-Host ""
            Write-Host "❌ Still cannot delete .next directory" -ForegroundColor Red
            Write-Host ""
            Write-Host "Try these steps:" -ForegroundColor Yellow
            Write-Host "1. Close ALL terminals/editors (VS Code, Cursor, etc.)" -ForegroundColor White
            Write-Host "2. Restart your computer" -ForegroundColor White
            Write-Host "3. Then delete .next using File Explorer" -ForegroundColor White
            Write-Host ""
            Write-Host "OR: Just rename .next to .next.old and continue" -ForegroundColor Cyan
        } else {
            Write-Host ""
            Write-Host "✅ Successfully deleted .next directory!" -ForegroundColor Green
            Write-Host ""
            Write-Host "You can now run: npm run dev" -ForegroundColor Cyan
        }
    } catch {
        Write-Host ""
        Write-Host "❌ Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Try renaming .next to .next.old instead:" -ForegroundColor Yellow
        Write-Host "  Rename-Item .next .next.old" -ForegroundColor White
    }
} else {
    Write-Host "✅ .next directory doesn't exist (already deleted)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan


# Force clear Next.js build cache by killing Node processes
# WARNING: This will stop ALL Node.js processes on your system

Write-Host "=== FORCE CLEAR BUILD CACHE ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Find Node processes
Write-Host "Finding Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js process(es):" -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        Write-Host "  - PID: $($_.Id) | Path: $($_.Path)" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
    
    # Kill all Node processes
    $nodeProcesses | ForEach-Object {
        try {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  ✓ Stopped PID $($_.Id)" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ Failed to stop PID $($_.Id)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "Waiting 3 seconds for processes to fully terminate..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
} else {
    Write-Host "No Node.js processes found." -ForegroundColor Green
}

Write-Host ""
Write-Host "Attempting to delete .next directory..." -ForegroundColor Cyan

# Step 2: Try to delete .next
if (Test-Path .next) {
    try {
        # Delete files first
        Write-Host "  Deleting files..." -ForegroundColor Gray
        Get-ChildItem .next -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        }
        
        # Delete directories (deepest first)
        Write-Host "  Deleting directories..." -ForegroundColor Gray
        Get-ChildItem .next -Recurse -Directory -ErrorAction SilentlyContinue | 
            Sort-Object FullName -Descending | ForEach-Object {
                Remove-Item $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
            }
        
        # Finally delete .next itself
        Write-Host "  Deleting .next folder..." -ForegroundColor Gray
        Remove-Item .next -Force -Recurse -ErrorAction SilentlyContinue
        
        Start-Sleep -Seconds 1
        
        if (Test-Path .next) {
            Write-Host ""
            Write-Host "❌ Still cannot delete .next directory" -ForegroundColor Red
            Write-Host ""
            Write-Host "Try these steps:" -ForegroundColor Yellow
            Write-Host "1. Close ALL terminals/editors (VS Code, Cursor, etc.)" -ForegroundColor White
            Write-Host "2. Restart your computer" -ForegroundColor White
            Write-Host "3. Then delete .next using File Explorer" -ForegroundColor White
            Write-Host ""
            Write-Host "OR: Just rename .next to .next.old and continue" -ForegroundColor Cyan
        } else {
            Write-Host ""
            Write-Host "✅ Successfully deleted .next directory!" -ForegroundColor Green
            Write-Host ""
            Write-Host "You can now run: npm run dev" -ForegroundColor Cyan
        }
    } catch {
        Write-Host ""
        Write-Host "❌ Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Try renaming .next to .next.old instead:" -ForegroundColor Yellow
        Write-Host "  Rename-Item .next .next.old" -ForegroundColor White
    }
} else {
    Write-Host "✅ .next directory doesn't exist (already deleted)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan














