# Automated Phase 7 & 8 Testing
# Tests performance and feature verification

$baseUrl = "http://localhost:3000"
$results = @()
$phase7Results = @()
$phase8Results = @()
$startTime = Get-Date

Write-Host "=== AUTOMATED PHASE 7 & 8 TESTING ===" -ForegroundColor Cyan
Write-Host "Start Time: $startTime" -ForegroundColor Gray
Write-Host ""

# Step 1: Login to get session
Write-Host "--- Step 1: Authentication ---" -ForegroundColor Yellow
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email = "admin@alainbcenter.com"; password = "CHANGE_ME" } | ConvertTo-Json

try {
    Write-Host "Logging in..." -NoNewline
    $loginResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -SessionVariable session -UseBasicParsing -ErrorAction Stop
    
    if ($loginResponse.StatusCode -eq 200) {
        Write-Host " ✅ SUCCESS" -ForegroundColor Green
        $phase8Results += [PSCustomObject]@{
            Category = "Authentication"
            Test = "Login"
            Status = "PASS"
            Details = "Successfully logged in"
        }
    } else {
        Write-Host " ❌ FAILED (Status: $($loginResponse.StatusCode))" -ForegroundColor Red
        $phase8Results += [PSCustomObject]@{
            Category = "Authentication"
            Test = "Login"
            Status = "FAIL"
            Details = "Status code: $($loginResponse.StatusCode)"
        }
        exit
    }
} catch {
    Write-Host " ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $phase8Results += [PSCustomObject]@{
        Category = "Authentication"
        Test = "Login"
        Status = "FAIL"
        Details = $_.Exception.Message
    }
    exit
}

Write-Host ""

# Step 2: Phase 7 - Performance Testing
Write-Host "--- Step 2: Phase 7 Performance Testing ---" -ForegroundColor Yellow

$performanceEndpoints = @(
    @{Path="/api/leads"; Name="Leads List"},
    @{Path="/api/renewals"; Name="Renewals"},
    @{Path="/api/inbox/conversations"; Name="Inbox Conversations"},
    @{Path="/api/reports/kpis"; Name="Reports KPIs"},
    @{Path="/api/reports/users"; Name="Reports Users"},
    @{Path="/api/admin/users"; Name="Admin Users"},
    @{Path="/api/admin/services"; Name="Admin Services"}
)

foreach ($endpoint in $performanceEndpoints) {
    try {
        Write-Host "Testing: $($endpoint.Name)..." -NoNewline
        
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        try {
            $response = Invoke-WebRequest -Uri "$baseUrl$($endpoint.Path)" -Method GET -WebSession $session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
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
        
        $target = if ($endpoint.Path -eq "/api/renewals/run") { 2000 } else { 500 }
        $status = if ($success -and $elapsedMs -lt $target) { "✅ PASS" } elseif ($success) { "⚠️  SLOW" } else { "❌ FAIL" }
        $color = if ($success -and $elapsedMs -lt $target) { "Green" } elseif ($success) { "Yellow" } else { "Red" }
        
        Write-Host " $status ($elapsedMs ms, Status: $statusCode)" -ForegroundColor $color
        
        $phase7Results += [PSCustomObject]@{
            Endpoint = $endpoint.Name
            Path = $endpoint.Path
            StatusCode = $statusCode
            ResponseTime = $elapsedMs
            Success = $success
            Passed = $success -and $elapsedMs -lt $target
        }
        
    } catch {
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $phase7Results += [PSCustomObject]@{
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

# Step 3: Phase 8 - Feature Verification
Write-Host "--- Step 3: Phase 8 Feature Verification ---" -ForegroundColor Yellow

# Test protected routes access
$protectedRoutes = @(
    @{Path="/"; Name="Dashboard"},
    @{Path="/leads"; Name="Leads Page"},
    @{Path="/renewals"; Name="Renewals Page"},
    @{Path="/inbox"; Name="Inbox Page"},
    @{Path="/admin"; Name="Admin Dashboard"},
    @{Path="/admin/users"; Name="Admin Users"},
    @{Path="/admin/services"; Name="Admin Services"},
    @{Path="/reports"; Name="Reports Page"}
)

foreach ($route in $protectedRoutes) {
    try {
        Write-Host "Testing: $($route.Name)..." -NoNewline
        
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        try {
            $response = Invoke-WebRequest -Uri "$baseUrl$($route.Path)" -Method GET -WebSession $session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
            $statusCode = $response.StatusCode
            $success = $true
            $details = "Page loads successfully"
        } catch {
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $success = $false
                $details = "Status: $statusCode"
            } else {
                throw
            }
        }
        
        $stopwatch.Stop()
        $elapsedMs = $stopwatch.ElapsedMilliseconds
        
        $status = if ($success -and $statusCode -eq 200) { "✅ PASS" } else { "❌ FAIL" }
        $color = if ($success -and $statusCode -eq 200) { "Green" } else { "Red" }
        
        Write-Host " $status ($elapsedMs ms)" -ForegroundColor $color
        
        $phase8Results += [PSCustomObject]@{
            Category = "Page Access"
            Test = $route.Name
            Status = if ($success -and $statusCode -eq 200) { "PASS" } else { "FAIL" }
            Details = $details
            ResponseTime = $elapsedMs
        }
        
    } catch {
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $phase8Results += [PSCustomObject]@{
            Category = "Page Access"
            Test = $route.Name
            Status = "FAIL"
            Details = $_.Exception.Message
            ResponseTime = -1
        }
    }
}

Write-Host ""

# Test API endpoint availability
Write-Host "--- Testing API Endpoints Availability ---" -ForegroundColor Yellow

$apiEndpoints = @(
    @{Path="/api/leads"; Method="GET"; Name="Get Leads"},
    @{Path="/api/renewals"; Method="GET"; Name="Get Renewals"},
    @{Path="/api/admin/users"; Method="GET"; Name="Get Users"}
)

foreach ($endpoint in $apiEndpoints) {
    try {
        Write-Host "Testing: $($endpoint.Name)..." -NoNewline
        
        $response = Invoke-WebRequest -Uri "$baseUrl$($endpoint.Path)" -Method $endpoint.Method -WebSession $session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        
        $status = if ($response.StatusCode -eq 200) { "✅ PASS" } else { "⚠️  Status: $($response.StatusCode)" }
        $color = if ($response.StatusCode -eq 200) { "Green" } else { "Yellow" }
        
        Write-Host " $status" -ForegroundColor $color
        
        $phase8Results += [PSCustomObject]@{
            Category = "API Endpoints"
            Test = $endpoint.Name
            Status = if ($response.StatusCode -eq 200) { "PASS" } else { "PARTIAL" }
            Details = "Status: $($response.StatusCode)"
        }
        
    } catch {
        Write-Host " ❌ ERROR" -ForegroundColor Red
        $phase8Results += [PSCustomObject]@{
            Category = "API Endpoints"
            Test = $endpoint.Name
            Status = "FAIL"
            Details = $_.Exception.Message
        }
    }
}

$endTime = Get-Date
$totalTime = ($endTime - $startTime).TotalSeconds

Write-Host ""
Write-Host "=== PHASE 7 SUMMARY ===" -ForegroundColor Cyan
$phase7Total = $phase7Results.Count
$phase7Passed = ($phase7Results | Where-Object { $_.Passed -eq $true }).Count
Write-Host "Total Tests: $phase7Total" -ForegroundColor White
Write-Host "Passed: $phase7Passed" -ForegroundColor Green
Write-Host "Failed: $($phase7Total - $phase7Passed)" -ForegroundColor $(if (($phase7Total - $phase7Passed) -eq 0) { "Green" } else { "Red" })

$slowEndpoints = $phase7Results | Where-Object { $_.ResponseTime -gt 500 -and $_.Success }
if ($slowEndpoints) {
    Write-Host ""
    Write-Host "⚠️  Slow Endpoints (> 500ms):" -ForegroundColor Yellow
    foreach ($ep in $slowEndpoints) {
        Write-Host "  - $($ep.Endpoint): $($ep.ResponseTime) ms"
    }
}

Write-Host ""
Write-Host "=== PHASE 8 SUMMARY ===" -ForegroundColor Cyan
$phase8Total = $phase8Results.Count
$phase8Passed = ($phase8Results | Where-Object { $_.Status -eq "PASS" }).Count
Write-Host "Total Tests: $phase8Total" -ForegroundColor White
Write-Host "Passed: $phase8Passed" -ForegroundColor Green
Write-Host "Failed: $($phase8Total - $phase8Passed)" -ForegroundColor $(if (($phase8Total - $phase8Passed) -eq 0) { "Green" } else { "Red" })

Write-Host ""
Write-Host "=== OVERALL SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total Test Time: $([math]::Round($totalTime, 2)) seconds" -ForegroundColor Gray
Write-Host "Phase 7 Pass Rate: $([math]::Round(($phase7Passed / $phase7Total) * 100, 1))%" -ForegroundColor $(if ($phase7Passed -eq $phase7Total) { "Green" } else { "Yellow" })
Write-Host "Phase 8 Pass Rate: $([math]::Round(($phase8Passed / $phase8Total) * 100, 1))%" -ForegroundColor $(if ($phase8Passed -eq $phase8Total) { "Green" } else { "Yellow" })

# Export results
$exportData = @{
    Phase7 = $phase7Results
    Phase8 = $phase8Results
    Summary = @{
        Phase7Passed = $phase7Passed
        Phase7Total = $phase7Total
        Phase8Passed = $phase8Passed
        Phase8Total = $phase8Total
        TotalTime = $totalTime
    }
}

$exportData | ConvertTo-Json -Depth 5 | Out-File "docs/phase7-8-automated-results.json" -Encoding UTF8
Write-Host ""
Write-Host "Results exported to: docs/phase7-8-automated-results.json" -ForegroundColor Gray

