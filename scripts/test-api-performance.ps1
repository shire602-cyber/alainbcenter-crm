# API Performance Testing Script
# Tests critical API endpoints and measures response times

$baseUrl = "http://localhost:3000"

Write-Host "=== API Performance Testing ===" -ForegroundColor Cyan
Write-Host ""

# Test endpoints
$endpoints = @(
    @{Method="GET"; Path="/api/leads"; Name="Leads List"},
    @{Method="GET"; Path="/api/renewals"; Name="Renewals"},
    @{Method="GET"; Path="/api/inbox/conversations"; Name="Inbox Conversations"}
)

$results = @()

foreach ($endpoint in $endpoints) {
    try {
        Write-Host "Testing: $($endpoint.Name) ($($endpoint.Path))..." -NoNewline
        
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        $response = try {
            Invoke-WebRequest -Uri "$baseUrl$($endpoint.Path)" -Method $endpoint.Method -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        } catch {
            if ($_.Exception.Response) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                Write-Host " ERROR: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
                Write-Host "  Response: $responseBody" -ForegroundColor Yellow
                continue
            } else {
                throw
            }
        }
        
        $stopwatch.Stop()
        $elapsedMs = $stopwatch.ElapsedMilliseconds
        
        $status = if ($elapsedMs -lt 500) { "✅ PASS" } else { "⚠️  SLOW" }
        $color = if ($elapsedMs -lt 500) { "Green" } else { "Yellow" }
        
        Write-Host " $status ($elapsedMs ms)" -ForegroundColor $color
        
        $results += [PSCustomObject]@{
            Endpoint = $endpoint.Name
            Path = $endpoint.Path
            Method = $endpoint.Method
            StatusCode = $response.StatusCode
            ResponseTime = $elapsedMs
            Passed = $elapsedMs -lt 500
        }
        
    } catch {
        Write-Host " FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $results += [PSCustomObject]@{
            Endpoint = $endpoint.Name
            Path = $endpoint.Path
            Method = $endpoint.Method
            StatusCode = "ERROR"
            ResponseTime = -1
            Passed = $false
        }
    }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host ""

$passed = ($results | Where-Object { $_.Passed -eq $true }).Count
$total = $results.Count

Write-Host "Passed: $passed / $total" -ForegroundColor $(if ($passed -eq $total) { "Green" } else { "Yellow" })
Write-Host ""

foreach ($result in $results) {
    $symbol = if ($result.Passed) { "✅" } else { "❌" }
    Write-Host "$symbol $($result.Endpoint): $($result.ResponseTime) ms (Status: $($result.StatusCode))"
}

Write-Host ""
Write-Host "Note: These tests require authentication. Add authentication cookies if needed." -ForegroundColor Gray

