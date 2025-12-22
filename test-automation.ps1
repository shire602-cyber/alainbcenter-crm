# Test script for lead ingestion and automation
# Run this after starting the dev server

Write-Host "=== TESTING LEAD INGESTION ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test lead
$testLead = @{
    fullName = "Test User"
    phone = "+971501234567"
    email = "test@example.com"
    service = "Family Visa"
    source = "website"
    notes = "Test lead for automation testing"
    expiryDate = (Get-Date).AddDays(90).ToString("yyyy-MM-dd")
} | ConvertTo-Json

Write-Host "1. Creating test lead..." -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/leads/ingest" -Method POST -Body $testLead -ContentType "application/json"
    Write-Host "✓ Lead created successfully!" -ForegroundColor Green
    Write-Host "   Lead ID: $($result.lead.id)" -ForegroundColor White
    Write-Host "   AI Score: $($result.aiScore)" -ForegroundColor White
    Write-Host "   AI Notes: $($result.aiNotes)" -ForegroundColor White
    $leadId = $result.lead.id
} catch {
    Write-Host "✗ Error creating lead: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== TESTING DAILY AUTOMATION ===" -ForegroundColor Cyan
Write-Host ""

# Step 2: Run daily automation
Write-Host "2. Running daily automation..." -ForegroundColor Yellow
try {
    $automationResult = Invoke-RestMethod -Uri "http://localhost:3000/api/automation/run-daily" -Method POST
    Write-Host "✓ Automation completed!" -ForegroundColor Green
    Write-Host "   Expiry reminders sent: $($automationResult.expiryRemindersSent)" -ForegroundColor White
    Write-Host "   Follow-ups sent: $($automationResult.followUpsSent)" -ForegroundColor White
    if ($automationResult.errors.Count -gt 0) {
        Write-Host "   Errors:" -ForegroundColor Yellow
        $automationResult.errors | ForEach-Object { Write-Host "     - $_" -ForegroundColor Yellow }
    }
} catch {
    Write-Host "✗ Error running automation: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== VIEWING LEAD DETAILS ===" -ForegroundColor Cyan
Write-Host ""

# Step 3: Get communication logs for the lead
Write-Host "3. Fetching communication logs..." -ForegroundColor Yellow
try {
    $logs = Invoke-RestMethod -Uri "http://localhost:3000/api/leads/$leadId/log" -Method GET
    Write-Host "✓ Found $($logs.Count) communication log entries" -ForegroundColor Green
    Write-Host ""
    foreach ($log in $logs) {
        Write-Host "   [$($log.createdAt)] $($log.channel) ($($log.direction))" -ForegroundColor White
        if ($log.messageSnippet) {
            Write-Host "   Message: $($log.messageSnippet.Substring(0, [Math]::Min(100, $log.messageSnippet.Length)))..." -ForegroundColor Gray
        }
        Write-Host ""
    }
} catch {
    Write-Host "✗ Error fetching logs: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST COMPLETE ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "View lead details in browser:" -ForegroundColor White
Write-Host "  http://localhost:3000/leads/$leadId" -ForegroundColor Cyan
Write-Host ""

