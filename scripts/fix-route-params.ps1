# Fix Next.js 15 params type signatures in route handlers
# Change from: { params: { id: string } | Promise<{ id: string }> }
# To: { params: Promise<{ id: string }> }

$routeFiles = Get-ChildItem -Path src/app/api -Recurse -Filter route.ts

foreach ($file in $routeFiles) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $originalContent = $content
    $modified = $false

    # Fix params type signatures
    if ($content -match 'params.*?:\s*\{\s*([^}]+)\s*\}\s*\|\s*Promise<') {
        # Pattern: params: { id: string } | Promise<{ id: string }>
        $content = $content -replace 'params\s*:\s*\{\s*([^}]+)\s*\}\s*\|\s*Promise<\{([^}]+)\}>', 'params: Promise<{$2}>'
        $modified = $true
    }
    if ($content -match 'params.*?:\s*Promise<\{[^}]+\}>\s*\|\s*\{') {
        # Pattern: params: Promise<{ id: string }> | { id: string }
        $content = $content -replace 'params\s*:\s*Promise<\{([^}]+)\}>\s*\|\s*\{\s*[^}]+\s*\}', 'params: Promise<{$1}>'
        $modified = $true
    }

    # Fix Promise.resolve(params) to just params
    if ($content -match 'Promise\.resolve\(params\)') {
        $content = $content -replace 'Promise\.resolve\(params\)', 'params'
        $modified = $true
    }

    if ($modified) {
        [System.IO.File]::WriteAllText($file.FullName, $content)
        Write-Host "Fixed: $($file.FullName)"
    }
}

Write-Host "Done fixing route params types"


