# Teste simples do Agente de Vendas via PowerShell
# Executar em terminal SEPARADO do servidor

$BASE_URL = "http://localhost:5000"

function Test-Health {
    try {
        $response = Invoke-RestMethod -Uri "$BASE_URL/api/health" -Method GET -TimeoutSec 5
        Write-Host "Servidor OK" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "Servidor nao responde em $BASE_URL" -ForegroundColor Red
        return $false
    }
}

function Clear-Session {
    param([string]$Phone)
    try {
        $body = @{ phone = $Phone } | ConvertTo-Json
        Invoke-RestMethod -Uri "$BASE_URL/api/test/clear-session" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Send-Message {
    param([string]$Phone, [string]$Message)
    try {
        $body = @{ phone = $Phone; message = $Message; skipTrigger = $true } | ConvertTo-Json -Depth 3
        $response = Invoke-RestMethod -Uri "$BASE_URL/api/test/admin-message" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
        return $response
    } catch {
        Write-Host "   Erro: $_" -ForegroundColor Red
        return $null
    }
}

# Tipos de negocio para testar
$businesses = @(
    @{ empresa = "Loja Bella Moda"; agente = "Julia"; funcao = "vendedora"; instrucoes = "Vendemos roupas femininas. Vestidos 100-500 reais." },
    @{ empresa = "Pizzaria Napoli"; agente = "Mario"; funcao = "atendente"; instrucoes = "Pizzas tradicionais e gourmet. Delivery ate 22h." },
    @{ empresa = "Clinica Sorria"; agente = "Dra. Sorria"; funcao = "recepcionista"; instrucoes = "Limpeza, clareamento, implantes. Emergencia 24h." },
    @{ empresa = "Salao Glamour"; agente = "Bella"; funcao = "recepcionista"; instrucoes = "Corte, coloracao, escova, unhas. Agendamento online." },
    @{ empresa = "Advocacia Direito"; agente = "Dr. Lei"; funcao = "secretaria"; instrucoes = "Direito trabalhista, familiar, civil. Consulta 200 reais." },
    @{ empresa = "English Now"; agente = "Teacher"; funcao = "secretaria"; instrucoes = "Ingles, espanhol, frances. Presencial e online." },
    @{ empresa = "WebDev Studio"; agente = "Dev"; funcao = "consultor"; instrucoes = "Sites, e-commerce, landing pages. 2000 reais ou mais." },
    @{ empresa = "Burger House"; agente = "Burgao"; funcao = "atendente"; instrucoes = "Hamburgueres artesanais. Combos. Delivery via app." },
    @{ empresa = "Academia Forca"; agente = "Personal"; funcao = "consultor"; instrucoes = "Musculacao, funcional, danca. Planos 89 por mes." },
    @{ empresa = "TechStore Eletronicos"; agente = "Pedro"; funcao = "vendedor"; instrucoes = "Celulares, notebooks, tablets. Garantia 1 ano." }
)

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "TESTE DO AGENTE DE VENDAS - 10 TIPOS DE NEGOCIO" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# Verificar servidor
if (-not (Test-Health)) {
    Write-Host ""
    Write-Host "Inicie o servidor com: npm run dev" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$passed = 0
$failed = 0
$total = $businesses.Count

for ($i = 0; $i -lt $total; $i++) {
    $biz = $businesses[$i]
    $phone = "551799900" + $i.ToString().PadLeft(4, "0")
    
    Write-Host ""
    Write-Host "[$($i+1)/$total] $($biz.empresa)" -ForegroundColor White
    Write-Host "   Agente: $($biz.agente) | Funcao: $($biz.funcao)" -ForegroundColor Gray
    
    # Limpar sessao
    Clear-Session -Phone $phone | Out-Null
    Start-Sleep -Milliseconds 300
    
    # Mensagem 1: Interesse
    $r1 = Send-Message -Phone $phone -Message "Oi, quero saber mais sobre o agente de IA de voces"
    if (-not $r1 -or -not $r1.response) {
        Write-Host "   FALHOU - Sem resposta" -ForegroundColor Red
        $failed++
        continue
    }
    
    # Verificar se NAO pergunta sobre desconexao (bug anterior)
    if ($r1.response -match "desconectado|conexao") {
        Write-Host "   ERRO: Perguntou sobre desconexao para cliente novo" -ForegroundColor Red
        $failed++
        continue
    }
    
    Start-Sleep -Milliseconds 500
    
    # Mensagem 2: Empresa
    $r2 = Send-Message -Phone $phone -Message "Tenho uma empresa chamada $($biz.empresa)"
    if (-not $r2 -or -not $r2.response) {
        Write-Host "   FALHOU - Sem resposta ao informar empresa" -ForegroundColor Red
        $failed++
        continue
    }
    
    Start-Sleep -Milliseconds 500
    
    # Mensagem 3: Agente
    $r3 = Send-Message -Phone $phone -Message "O agente vai se chamar $($biz.agente) e vai ser $($biz.funcao)"
    if (-not $r3 -or -not $r3.response) {
        Write-Host "   FALHOU - Sem resposta ao informar agente" -ForegroundColor Red
        $failed++
        continue
    }
    
    Start-Sleep -Milliseconds 500
    
    # Mensagem 4: Instrucoes
    $r4 = Send-Message -Phone $phone -Message $biz.instrucoes
    if (-not $r4 -or -not $r4.response) {
        Write-Host "   FALHOU - Sem resposta ao informar instrucoes" -ForegroundColor Red
        $failed++
        continue
    }
    
    Start-Sleep -Milliseconds 500
    
    # Mensagem 5: Pedir teste
    $r5 = Send-Message -Phone $phone -Message "Quero testar agora! Pode criar meu acesso?"
    if (-not $r5) {
        Write-Host "   FALHOU - Sem resposta ao pedir teste" -ForegroundColor Red
        $failed++
        continue
    }
    
    # Verificar comportamento
    $issues = @()
    
    if ($r5.response -match "#sair|virar o |Eu vou agir") {
        $issues += "IA tentou simular no WhatsApp (comportamento antigo)"
    }
    
    if ($r5.actions -and $r5.actions.testAccountCredentials) {
        Write-Host "   Conta criada: $($r5.actions.testAccountCredentials.email)" -ForegroundColor Green
    }
    
    # Limpar
    Clear-Session -Phone $phone | Out-Null
    
    if ($issues.Count -eq 0) {
        Write-Host "   PASSOU" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "   FALHOU" -ForegroundColor Red
        foreach ($issue in $issues) {
            Write-Host "      $issue" -ForegroundColor Yellow
        }
        $failed++
    }
    
    Start-Sleep -Milliseconds 200
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "RESULTADO FINAL" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Passaram: $passed/$total" -ForegroundColor Green
Write-Host "Falharam: $failed/$total" -ForegroundColor Red

$successRate = [math]::Round(($passed / $total) * 100, 1)
Write-Host ""
Write-Host "Taxa de sucesso: $successRate por cento" -ForegroundColor White

if ($passed -eq $total) {
    Write-Host ""
    Write-Host "TODOS OS TESTES PASSARAM!" -ForegroundColor Green
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
