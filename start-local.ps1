# Script para iniciar o AgenteZap localmente
# Este script carrega as variáveis de ambiente do .env e inicia o servidor

Write-Host "🚀 Iniciando AgenteZap localmente..." -ForegroundColor Green

# Verificar se o .env existe
if (-not (Test-Path ".env")) {
    Write-Host "❌ Arquivo .env não encontrado! Copie o .env.example e configure suas variáveis." -ForegroundColor Red
    exit 1
}

# Carregar variáveis do .env
Get-Content .env | ForEach-Object {
    if ($_ -match "^([^#=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

Write-Host "✅ Variáveis de ambiente carregadas" -ForegroundColor Green

# Verificar modo (dev ou production)
$mode = $args[0]
if ($mode -eq "prod" -or $mode -eq "production") {
    Write-Host "📦 Iniciando em modo PRODUÇÃO..." -ForegroundColor Yellow
    npm run build
    npm start
} else {
    Write-Host "🔧 Iniciando em modo DESENVOLVIMENTO..." -ForegroundColor Cyan
    npm run dev
}
