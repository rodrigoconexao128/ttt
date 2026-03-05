# Script de teste do admin agent - PowerShell
# Execute este script enquanto o servidor está rodando

Write-Host "`n🧪 TESTANDO AGENTE ADMIN`n" -ForegroundColor Cyan
Write-Host "=" * 50

# 1. Test health
Write-Host "`n1. Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/" -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ Servidor respondendo (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Servidor não está respondendo: $_" -ForegroundColor Red
    exit 1
}

# 2. Test admin login
Write-Host "`n2. Admin Login..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "rodrigoconexao128@gmail.com"
        password = "Ibira2019!"
    } | ConvertTo-Json
    
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/login" -Method POST -Body $loginBody -ContentType "application/json" -WebSession $session -TimeoutSec 10
    
    if ($loginResponse.success -or $loginResponse.authenticated) {
        Write-Host "✅ Login bem sucedido" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Resposta: $($loginResponse | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Erro no login: $_" -ForegroundColor Red
}

# 3. Test auto-atendimento config
Write-Host "`n3. Config Auto-Atendimento..." -ForegroundColor Yellow
try {
    $configResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/auto-atendimento/config" -Method GET -WebSession $session -TimeoutSec 10
    Write-Host "✅ Config obtida:" -ForegroundColor Green
    Write-Host "   - Enabled: $($configResponse.enabled)"
    Write-Host "   - Prompt length: $($configResponse.prompt.Length) chars"
    Write-Host "   - Notification number: $($configResponse.ownerNotificationNumber)"
} catch {
    Write-Host "❌ Erro ao obter config: $_" -ForegroundColor Red
}

# 4. Test enable auto-atendimento
Write-Host "`n4. Ativar Auto-Atendimento..." -ForegroundColor Yellow
try {
    $enableBody = @{ enabled = $true } | ConvertTo-Json
    $enableResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/auto-atendimento/config" -Method POST -Body $enableBody -ContentType "application/json" -WebSession $session -TimeoutSec 10
    Write-Host "✅ Auto-atendimento ativado" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao ativar: $_" -ForegroundColor Red
}

# 5. Verify it's enabled
Write-Host "`n5. Verificar se está ativo..." -ForegroundColor Yellow
try {
    $verifyResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/auto-atendimento/config" -Method GET -WebSession $session -TimeoutSec 10
    if ($verifyResponse.enabled -eq $true) {
        Write-Host "✅ Confirmado: Auto-atendimento está ATIVO" -ForegroundColor Green
    } else {
        Write-Host "❌ Auto-atendimento ainda está desativado" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Erro ao verificar: $_" -ForegroundColor Red
}

# 6. Test AI agent
Write-Host "`n6. Testar Resposta IA..." -ForegroundColor Yellow
try {
    $testBody = @{ message = "Ola, quero saber mais sobre o AgenteZap" } | ConvertTo-Json
    $testResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/agent/test" -Method POST -Body $testBody -ContentType "application/json" -WebSession $session -TimeoutSec 30
    
    if ($testResponse.response) {
        Write-Host "✅ IA respondeu:" -ForegroundColor Green
        Write-Host "   '$($testResponse.response.Substring(0, [Math]::Min(100, $testResponse.response.Length)))...'" -ForegroundColor White
    } else {
        Write-Host "⚠️ Sem resposta da IA" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Erro ao testar IA: $_" -ForegroundColor Red
}

# 7. Test stats
Write-Host "`n7. Estatísticas..." -ForegroundColor Yellow
try {
    $statsResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/stats" -Method GET -WebSession $session -TimeoutSec 10
    Write-Host "✅ Stats:" -ForegroundColor Green
    Write-Host "   - Total users: $($statsResponse.totalUsers)"
    Write-Host "   - Active subs: $($statsResponse.activeSubscriptions)"
} catch {
    Write-Host "❌ Erro ao obter stats: $_" -ForegroundColor Red
}

Write-Host "`n" + "=" * 50
Write-Host "🏁 TESTES CONCLUÍDOS`n" -ForegroundColor Cyan
