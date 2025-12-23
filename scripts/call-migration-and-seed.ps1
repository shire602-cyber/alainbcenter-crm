# PowerShell script to apply migration and seed rules via API endpoints
# 
# Usage:
#   .\scripts\call-migration-and-seed.ps1 -BaseUrl "https://your-app.vercel.app" -SessionCookie "session=abc123..."

param(
    [string]$BaseUrl = "http://localhost:3000",
    [Parameter(Mandatory=$true)]
    [string]$SessionCookie
)

Write-Host "🚀 Applying migration and seeding rules..." -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Gray
Write-Host ""

# Step 1: Apply Migration
Write-Host "📦 Step 1: Applying database migration..." -ForegroundColor Yellow
try {
    $migrateResponse = Invoke-RestMethod -Uri "$BaseUrl/api/admin/migrate" `
        -Method POST `
        -Headers @{
            "Cookie" = $SessionCookie
            "Content-Type" = "application/json"
        }
    
    if ($migrateResponse.success) {
        Write-Host "✅ Migration applied successfully" -ForegroundColor Green
        if ($migrateResponse.message) {
            Write-Host "   $($migrateResponse.message)" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ Migration failed:" -ForegroundColor Red
        Write-Host ($migrateResponse | ConvertTo-Json -Depth 10) -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Migration error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Seed Info Follow-up Rules
Write-Host "📦 Step 2: Seeding info/quotation follow-up rules..." -ForegroundColor Yellow
try {
    $seedInfoResponse = Invoke-RestMethod -Uri "$BaseUrl/api/admin/automation/seed-info-followup" `
        -Method POST `
        -Headers @{
            "Cookie" = $SessionCookie
            "Content-Type" = "application/json"
        }
    
    if ($seedInfoResponse.ok) {
        Write-Host "✅ Info follow-up rules seeded successfully" -ForegroundColor Green
        if ($seedInfoResponse.message) {
            Write-Host "   $($seedInfoResponse.message)" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ Seeding info follow-up rules failed:" -ForegroundColor Red
        Write-Host ($seedInfoResponse | ConvertTo-Json -Depth 10) -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Seeding info follow-up error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 3: Seed Escalation Rules
Write-Host "📦 Step 3: Seeding escalation rules..." -ForegroundColor Yellow
try {
    $seedEscalationResponse = Invoke-RestMethod -Uri "$BaseUrl/api/admin/automation/seed-escalation" `
        -Method POST `
        -Headers @{
            "Cookie" = $SessionCookie
            "Content-Type" = "application/json"
        }
    
    if ($seedEscalationResponse.ok) {
        Write-Host "✅ Escalation rules seeded successfully" -ForegroundColor Green
        if ($seedEscalationResponse.message) {
            Write-Host "   $($seedEscalationResponse.message)" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ Seeding escalation rules failed:" -ForegroundColor Red
        Write-Host ($seedEscalationResponse | ConvertTo-Json -Depth 10) -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Seeding escalation error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 Migration and seeding complete!" -ForegroundColor Green
