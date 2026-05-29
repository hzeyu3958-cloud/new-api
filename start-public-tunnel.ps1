$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cloudflared = Join-Path $Root "tools\cloudflared\cloudflared.exe"
$LocalUrl = "http://localhost:3000"

if (-not (Test-Path $Cloudflared)) {
    Write-Host "cloudflared.exe not found. Run this first:"
    Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File .\start-new-api.ps1"
    exit 1
}

try {
    $status = Invoke-RestMethod -Uri "$LocalUrl/api/status" -TimeoutSec 5
} catch {
    Write-Host "New API is not reachable at $LocalUrl."
    Write-Host "Start it first with: powershell -NoProfile -ExecutionPolicy Bypass -File .\start-new-api.ps1"
    exit 1
}

try {
    $setup = Invoke-RestMethod -Uri "$LocalUrl/api/setup" -TimeoutSec 5
} catch {
    Write-Host "Could not read New API setup status."
    exit 1
}

if ($setup.success -ne $true -or $setup.data.root_init -ne $true) {
    Write-Host "Root user is not initialized yet. Refusing to expose New API to the public internet."
    Write-Host "Open $LocalUrl locally, finish setup/login first, then run this script again."
    exit 1
}

Write-Host "Starting public HTTPS tunnel for $LocalUrl ..."
Write-Host "Copy the https://*.trycloudflare.com URL shown below."
Write-Host "Client base URL should be: https://YOUR-TUNNEL-URL/v1"
& $Cloudflared tunnel --url $LocalUrl
