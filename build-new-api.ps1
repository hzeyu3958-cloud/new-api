$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Go = Join-Path (Split-Path -Parent $Root) "tools\go\bin\go.exe"

if (-not (Test-Path $Go)) {
    Write-Host "Go was not found at: $Go"
    exit 1
}

Push-Location $Root
try {
    & $Go build -o new-api-local.exe main.go
    Write-Host "Built: $Root\new-api-local.exe"
} finally {
    Pop-Location
}
