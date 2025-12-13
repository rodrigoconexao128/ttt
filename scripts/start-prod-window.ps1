param(
  [int]$Port = 5000
)

$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "Building..." -ForegroundColor Cyan
npm run build

Write-Host "Starting production server in a new PowerShell window..." -ForegroundColor Cyan
$cmd = @(
  "Set-Location '$root'",
  "`$env:NODE_ENV='production'",
  "`$env:PORT='$Port'",
  "node dist/index.js"
) -join '; '

Start-Process powershell -ArgumentList '-NoExit', '-Command', $cmd | Out-Null
Write-Host "OK. Server window opened." -ForegroundColor Green
Write-Host "Now run tests in THIS terminal:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File .\\scripts\\test-admin-burst.ps1 -Rounds 3" -ForegroundColor Yellow
