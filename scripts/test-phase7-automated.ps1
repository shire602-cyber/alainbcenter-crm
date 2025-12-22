# Automated Phase 7 Performance Testing
# Tests API endpoints and measures response times

$baseUrl = "http://localhost:3000"
$results = @()
$startTime = Get-Date

Write-Host "=== PHASE 7: AUTOMATED PERFORMANCE TESTING ===" -ForegroundColor Cyan
Write-Host "Start Time: $startTime" -ForegroundColor Gray
Write-Host ""

# Test public endpoints (no auth required)
$publicEndpoints = @(
    @{Method="GET"; Path="/api/health"; Name="Health Check"},
    @{Method="GET"; Path="/login"; Name="Login Page"}
)

# Test authenticated endpoints (will fail without auth, but we test structure)
$authEndpoints = @(
    @{Method="GET"; Path="/api/leads"; Name="Leads List"},
    @{Method="GET"; Path="/api/renewals"; Name="Renewals"},
    @{Method="GET"; Path="/api/inbox/conversations"; Name="Inbox Conversations"},
    @{Method="GET"; Path="/api/reports"; Name="Reports"}
)

Write-Host "--- Testing Public Endpoints ---" -ForegroundColor Yellow
foreach ($endpoint in $publicEndpoints) {
    try {
        Write-Host "Testing: $($endpoint.Name)..." -NoNewline
        
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        try {
            $response = Invoke-WebRequest -Uri "$baseUrl$($endpoint.Path)" -Method $endpoint.Method -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
            $statusCode = $response.StatusCode
            $success = $true
        } catch {
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $success = $false
            } else {
                throw
            }
        }
        
        $stopwatch.Stop()
        $elapsedMs = $stopwatch.ElapsedMilliseconds
        
        $status = if ($success -and $elapsedMs -lt 1000) { "✅ PASS" } elseif ($success) { "⚠️  SLOW" } else { "❌ FAIL" }
        $color = if ($success -and $elapsedMs -lt 1000) { "Green" } elseif ($success) { "Yellow" } else { "Red" }
        
        Write-Host " $status ($elapsedMs ms, Status: $statusCode)" -ForegroundColor $color
        
        $results += [PSCustomObject]@{
            Category = "Public"
            Endpoint = $endpoint.Name
            Path = $endpoint.Path
            StatusCode = $statusCode
            ResponseTime = $elapsedMs
            Success = $success
            Passed = $success -and $elapsedMs -lt 1000
        }
        
    } catch {
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $results += [PSCustomObject]@{
            Category = "Public"
            Endpoint = $endpoint.Name
            Path = $endpoint.Path
            StatusCode = "ERROR"
            ResponseTime = -1
            Success = $false
            Passed = $false
        }
    }
}

Write-Host ""
Write-Host "--- Testing Authenticated Endpoints (Structure Check) ---" -ForegroundColor Yellow
foreach ($endpoint in $authEndpoints) {
    try {
        Write-Host "Testing: $($endpoint.Name)..." -NoNewline
        
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        try {
            $response = Invoke-WebRequest -Uri "$baseUrl$($endpoint.Path)" -Method $endpoint.Method -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
            $statusCode = $response.StatusCode
            $success = $true
        } catch {
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $success = $false
                # 401/403 are expected without auth
                if ($statusCode -eq 401 -or $statusCode -eq 403) {
                    $success = $true # Endpoint exists, just needs auth
                }
            } else {
                throw
            }
        }
        
        $stopwatch.Stop()
        $elapsedMs = $stopwatch.ElapsedMilliseconds
        
        $status = if ($success) { "✅ EXISTS" } else { "❌ ERROR" }
        $color = if ($success) { "Green" } else { "Red" }
        
        Write-Host " $status ($elapsedMs ms, Status: $statusCode)" -ForegroundColor $color
        
        $results += [PSCustomObject]@{
            Category = "Authenticated"
            Endpoint = $endpoint.Name
            Path = $endpoint.Path
            StatusCode = $statusCode
            ResponseTime = $elapsedMs
            Success = $success
            Passed = $success
        }
        
    } catch {
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $results += [PSCustomObject]@{
            Category = "Authenticated"
            Endpoint = $endpoint.Name
            Path = $endpoint.Path
            StatusCode = "ERROR"
            ResponseTime = -1
            Success = $false
            Passed = $false
        }
    }
}

$endTime = Get-Date
$totalTime = ($endTime - $startTime).TotalSeconds

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host ""

$totalTests = $results.Count
$passed = ($results | Where-Object { $_.Passed -eq $true }).Count
$failed = $totalTests - $passed

Write-Host "Total Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "Total Test Time: $([math]::Round($totalTime, 2)) seconds" -ForegroundColor Gray
Write-Host ""

Write-Host "Detailed Results:" -ForegroundColor Yellow
foreach ($result in $results) {
    $symbol = if ($result.Passed) { "✅" } else { "❌" }
    $statusText = if ($result.StatusCode -eq 401 -or $result.StatusCode -eq 403) { "Needs Auth" } else { "Status: $($result.StatusCode)" }
    Write-Host "  $symbol $($result.Endpoint): $($result.ResponseTime) ms ($statusText)"
}

Write-Host ""
Write-Host "=== PERFORMANCE ANALYSIS ===" -ForegroundColor Cyan
Write-Host ""

$slowEndpoints = $results | Where-Object { $_.ResponseTime -gt 500 -and $_.Success }
if ($slowEndpoints) {
    Write-Host "⚠️  Slow Endpoints (> 500ms):" -ForegroundColor Yellow
    foreach ($ep in $slowEndpoints) {
        Write-Host "  - $($ep.Endpoint): $($ep.ResponseTime) ms"
    }
} else {
    Write-Host "✅ No slow endpoints detected" -ForegroundColor Green
}

Write-Host ""
Write-Host "Test completed at: $endTime" -ForegroundColor Gray

# Export results to JSON
$results | ConvertTo-Json -Depth 3 | Out-File "docs/phase7-automated-results.json" -Encoding UTF8
Write-Host ""
Write-Host "Results exported to: docs/phase7-automated-results.json" -ForegroundColor Gray


