# Script de teste do fluxo de conversa do admin agent
# Simula uma conversa de criacao de conta

Write-Host ""
Write-Host "TESTANDO FLUXO DE CONVERSA ADMIN" -ForegroundColor Cyan
Write-Host "=" * 50

# Login primeiro
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email = "rodrigoconexao128@gmail.com"; password = "Ibira2019!" } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/login" -Method POST -Body $loginBody -ContentType "application/json" -WebSession $session -TimeoutSec 10

$testPhone = "5511" + (Get-Random -Minimum 900000000 -Maximum 999999999).ToString()

function Send-Message {
    param([string]$message)
    
    $body = @{ message = $message; phoneNumber = $testPhone } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/agent/test" -Method POST -Body $body -ContentType "application/json" -WebSession $session -TimeoutSec 30
    return $response.response
}

Write-Host ""
Write-Host "Telefone de teste: $testPhone" -ForegroundColor Gray

# Conversa 1: Saudacao inicial
Write-Host ""
Write-Host "Cliente: Oi, tudo bem?" -ForegroundColor Yellow
$resp1 = Send-Message "Oi, tudo bem?"
Write-Host "Rodrigo: $resp1" -ForegroundColor Green

Start-Sleep -Seconds 2

# Conversa 2: Interesse
Write-Host ""
Write-Host "Cliente: Como funciona o agente de IA?" -ForegroundColor Yellow
$resp2 = Send-Message "Como funciona o agente de IA?"
Write-Host "Rodrigo: $resp2" -ForegroundColor Green

Start-Sleep -Seconds 2

# Conversa 3: Quer criar conta
Write-Host ""
Write-Host "Cliente: Quero criar minha conta" -ForegroundColor Yellow
$resp3 = Send-Message "Quero criar minha conta"
Write-Host "Rodrigo: $resp3" -ForegroundColor Green

Start-Sleep -Seconds 2

# Conversa 4: Envia email
Write-Host ""
Write-Host "Cliente: teste.usuario@exemplo.com" -ForegroundColor Yellow
$resp4 = Send-Message "teste.usuario@exemplo.com"
Write-Host "Rodrigo: $resp4" -ForegroundColor Green

Start-Sleep -Seconds 2

# Conversa 5: Nome do agente
Write-Host ""
Write-Host "Cliente: Laura" -ForegroundColor Yellow
$resp5 = Send-Message "Laura"
Write-Host "Rodrigo: $resp5" -ForegroundColor Green

Start-Sleep -Seconds 2

# Conversa 6: Nome da empresa
Write-Host ""
Write-Host "Cliente: Loja Fashion Store" -ForegroundColor Yellow
$resp6 = Send-Message "Loja Fashion Store"
Write-Host "Rodrigo: $resp6" -ForegroundColor Green

Start-Sleep -Seconds 2

# Conversa 7: Funcao do agente
Write-Host ""
Write-Host "Cliente: Atendente de vendas" -ForegroundColor Yellow
$resp7 = Send-Message "Atendente de vendas"
Write-Host "Rodrigo: $resp7" -ForegroundColor Green

Write-Host ""
Write-Host "=" * 50
Write-Host "FLUXO DE CONVERSA TESTADO" -ForegroundColor Cyan
Write-Host ""
