$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$GoBin = Join-Path (Split-Path -Parent $Root) "tools\go\bin"
$Exe = Join-Path $Root "new-api-local.exe"
$LogDir = Join-Path $Root "logs"

if (-not (Test-Path $Exe)) {
    Write-Host "new-api-local.exe not found. Build it first with: .\tools\build-new-api.ps1"
    exit 1
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$env:Path = "$GoBin;$env:Path"
$env:PORT = "3000"
$env:TZ = "Asia/Shanghai"
$env:ERROR_LOG_ENABLED = "true"
$env:BATCH_UPDATE_ENABLED = "true"

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "New API already appears to be listening on http://localhost:3000"
    exit 0
}

Start-Process -FilePath $Exe -ArgumentList @("--log-dir", "logs") -WorkingDirectory $Root -WindowStyle Hidden
Start-Sleep -Seconds 3

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "New API started: http://localhost:3000"
} else {
    Write-Host "New API did not start. Check the logs directory."
    exit 1
}
