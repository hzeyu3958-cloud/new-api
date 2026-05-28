$ErrorActionPreference = "Stop"

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    Write-Host "New API is not listening on port 3000."
    exit 0
}

$listener | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    Stop-Process -Id $_ -Force
}

Write-Host "New API stopped."
