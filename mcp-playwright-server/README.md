# MCP Playwright Server - Instalação e Configuração

## 📋 Visão Geral

Este diretório contém a instalação e configuração do servidor MCP (Model Context Protocol) do Playwright, que permite automação de navegador usando Playwright através do protocolo MCP.

## 🚀 Instalação Realizada

### 1. Instalação do Pacote
```bash
npm install -g @executeautomation/playwright-mcp-server
```

### 2. Configuração do Servidor
O arquivo `../cline_mcp_settings.json` foi configurado com:
```json
{
  "mcpServers": {
    "github.com/executeautomation/mcp-playwright": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"]
    }
  }
}
```

## 🛠️ Ferramentas Disponíveis

O servidor MCP do Playwright fornece as seguintes ferramentas:

| Ferramenta | Descrição | Exemplo de Uso |
|------------|-----------|----------------|
| `playwright_navigate` | Navega para uma URL | `{"url": "https://example.com"}` |
| `playwright_screenshot` | Tira screenshot da página | `{"width": 1280, "height": 720}` |
| `playwright_click` | Clica em elementos | `{"selector": "button#submit"}` |
| `playwright_type` | Digita texto em inputs | `{"selector": "input[name=search]", "text": "Hello"}` |
| `playwright_get_page_content` | Obtém HTML da página | `{}` |
| `playwright_execute_javascript` | Executa JavaScript | `{"script": "document.title"}` |
| `playwright_wait_for_selector` | Espera por elementos | `{"selector": ".loaded", "timeout": 5000}` |
| `playwright_get_element_text` | Obtém texto de elementos | `{"selector": "h1"}` |
| `playwright_web_scrape` | Web scraping estruturado | `{"url": "https://example.com", "selector": "article"}` |
| `playwright_generate_test_code` | Gera código de teste | `{"actions": ["navigate", "click", "wait"]}` |

## 📖 Como Usar

### Com Claude/Cline
As ferramentas estarão disponíveis como:
- `github.com/executeautomation/mcp-playwright:playwright_navigate`
- `github.com/executeautomation/mcp-playwright:playwright_screenshot`
- `github.com/executeautomation/mcp-playwright:playwright_click`
- E assim por diante...

### Exemplo de Fluxo de Automação
1. Navegar para uma página web
2. Esperar o carregamento completo
3. Tirar screenshot da página inicial
4. Preencher um formulário
5. Clicar em um botão
6. Esperar por um resultado
7. Tirar screenshot do resultado
8. Extrair dados da página
9. Gerar código de teste automatizado

## 🧪 Demonstração

Execute o script de demonstração para ver todas as capacidades:
```bash
node demo.cjs
```

## 📁 Estrutura de Arquivos

```
mcp-playwright-server/
├── README.md                 # Este arquivo de documentação
├── demo.cjs                  # Script de demonstração das capacidades
└── ../cline_mcp_settings.json # Configuração do servidor MCP
```

## ✅ Status da Instalação

- [x] Pacote instalado globalmente
- [x] Arquivo de configuração criado
- [x] Diretório do servidor criado
- [x] Documentação de demonstração criada
- [x] Capacidades demonstradas

## 🔗 Recursos Adicionais

- [Repositório Oficial](https://github.com/executeautomation/mcp-playwright)
- [Documentação](https://executeautomation.github.io/mcp-playwright/)
- [Referência de API](https://executeautomation.github.io/mcp-playwright/docs/playwright-web/Supported-Tools)

## 🎭 Sobre o Playwright

Playwright é uma biblioteca de automação de navegador da Microsoft que permite:
- Automatizar Chrome, Firefox e Safari
- Executar testes em paralelo
- Capturar screenshots e vídeos
- Simular dispositivos móveis
- Executar JavaScript no contexto da página

O servidor MCP expõe essas capacidades através do protocolo MCP, permitindo que LLMs interajam com páginas web de forma controlada e segura.
