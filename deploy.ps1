# Railway Deploy Script
# Execute: .\deploy.ps1

$rootPath = "C:\Users\Windows\Downloads\agentezap correto"

Write-Host ""
Write-Host "Railway Deploy - AgentezZap" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Mudando para raiz: $rootPath" -ForegroundColor Yellow

Set-Location $rootPath

Write-Host "Executando railway up..." -ForegroundColor Green
Write-Host ""

railway up

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Deploy concluido com sucesso!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Deploy falhou - codigo: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
