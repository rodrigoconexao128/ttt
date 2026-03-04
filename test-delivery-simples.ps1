#!/usr/bin/env pwsh
# TESTE SIMPLES DE DELIVERY - BIGACAICUIABA

$API_URL = "https://handsome-mindfulness-production.up.railway.app"
$USER_ID = "811c0403-ee01-4d60-8101-9b9e80684384"

Write-Host "`n══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   🧪 TESTE SIMPLES DE DELIVERY" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📍 API: $API_URL" -ForegroundColor White
Write-Host "👤 Usuário: bigacaicuiaba@gmail.com ($USER_ID)`n" -ForegroundColor White

# Teste 1: Pedir cardápio
Write-Host "🧪 TESTE 1: Cliente pede o cardápio" -ForegroundColor Magenta
Write-Host "──────────────────────────────────────────────────────────────`n" -ForegroundColor Magenta

$body = @{
    userId = $USER_ID
    message = "oi, quero ver o cardápio"
    history = @()
    sentMedias = @()
} | ConvertTo-Json -Depth 10

Write-Host "👤 CLIENTE: oi, quero ver o cardápio" -ForegroundColor Blue

try {
    $response = Invoke-RestMethod -Uri "$API_URL/api/test-agent/message" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 60

    $responseText = $response.response
    
    if ($responseText -like "*pizza*" -and $responseText -like "*R$*") {
        Write-Host "🤖 AGENTE: $($responseText.Substring(0, [Math]::Min(500, $responseText.Length)))" -ForegroundColor Green
        Write-Host "`n✅ PASSOU! O agente enviou o cardápio com preços" -ForegroundColor Green
    } else {
        Write-Host "🤖 AGENTE: $responseText" -ForegroundColor Yellow
        Write-Host "`n⚠️ ATENÇÃO! O agente respondeu mas não enviou cardápio completo" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "❌ ERRO: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalhes: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host "`n══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
