#!/usr/bin/env pwsh
# Script para configurar variáveis no Railway via CLI
# ⚠️ ATENÇÃO: Railway CLI v4.9+ não tem comando 'variables set'
# A configuração deve ser feita via Dashboard Web do Railway

Write-Host "🔧 Configuração de Variáveis do Railway" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️ O Railway CLI não possui comando para ALTERAR variáveis." -ForegroundColor Yellow
Write-Host "Você deve configurar manualmente via Dashboard Web." -ForegroundColor Yellow
Write-Host ""

Write-Host "📋 PASSOS PARA CORRIGIR:" -ForegroundColor Green
Write-Host ""
Write-Host "1. Acesse: https://railway.app/project/ad92eb6d-31d4-45b2-9b78-56898787e384" -ForegroundColor White
Write-Host "2. Selecione o serviço 'vvvv'" -ForegroundColor White
Write-Host "3. Clique na aba 'Variables'" -ForegroundColor White
Write-Host "4. Encontre a variável 'GOOGLE_REDIRECT_URI'" -ForegroundColor White
Write-Host "5. Clique no ícone de editar (lápis)" -ForegroundColor White
Write-Host "6. ALTERE o valor de:" -ForegroundColor White
Write-Host "   ❌ https://agentezap.online/api/scheduling/google-calendar/callback" -ForegroundColor Red
Write-Host "   PARA:" -ForegroundColor White
Write-Host "   ✅ https://agentezap.online/api/google-calendar/callback" -ForegroundColor Green
Write-Host "7. Clique em 'Update Variable'" -ForegroundColor White
Write-Host "8. O Railway fará redeploy automático" -ForegroundColor White
Write-Host ""

Write-Host "💡 DIFERENÇA:" -ForegroundColor Cyan
Write-Host "   A rota CORRETA não tem '/scheduling' no meio!" -ForegroundColor Yellow
Write-Host ""

Write-Host "📋 Após configurar, aguarde 2-3 minutos para o deploy completar." -ForegroundColor Green
Write-Host ""

# Abrir no navegador
$confirm = Read-Host "Deseja abrir o Railway Dashboard agora? (S/N)"
if ($confirm -eq "S" -or $confirm -eq "s") {
    Start-Process "https://railway.app/project/ad92eb6d-31d4-45b2-9b78-56898787e384/service/5c181da5-0dd2-4883-8838-4e85604f2941?settingsPage=variables"
    Write-Host "✅ Abrindo Railway Dashboard..." -ForegroundColor Green
}
