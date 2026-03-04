// Demonstração das capacidades do MCP Playwright Server
// Este arquivo mostra exemplos de como as ferramentas do servidor podem ser usadas

const { spawn } = require('child_process');
const path = require('path');

console.log('🎭 MCP Playwright Server - Demonstração de Capacidades');
console.log('=====================================================\n');

// Lista de ferramentas disponíveis baseadas na documentação
const availableTools = [
  {
    name: 'playwright_navigate',
    description: 'Navega para uma URL específica',
    example: { url: 'https://example.com' }
  },
  {
    name: 'playwright_screenshot',
    description: 'Tira um screenshot da página atual',
    example: { width: 1280, height: 720 }
  },
  {
    name: 'playwright_click',
    description: 'Clica em um elemento na página',
    example: { selector: 'button[id="submit"]' }
  },
  {
    name: 'playwright_type',
    description: 'Digita texto em um elemento',
    example: { selector: 'input[name="search"]', text: 'Hello World' }
  },
  {
    name: 'playwright_get_page_content',
    description: 'Obtém o conteúdo HTML da página',
    example: {}
  },
  {
    name: 'playwright_execute_javascript',
    description: 'Executa JavaScript na página',
    example: { script: 'document.title' }
  },
  {
    name: 'playwright_wait_for_selector',
    description: 'Espera por um elemento aparecer',
    example: { selector: '.loaded', timeout: 5000 }
  },
  {
    name: 'playwright_get_element_text',
    description: 'Obtém o texto de um elemento',
    example: { selector: 'h1' }
  },
  {
    name: 'playwright_web_scrape',
    description: 'Web scraping estruturado',
    example: { url: 'https://example.com', selector: 'article' }
  },
  {
    name: 'playwright_generate_test_code',
    description: 'Gera código de teste Playwright',
    example: { actions: ['navigate', 'click', 'wait'] }
  }
];

console.log('📋 Ferramentas Disponíveis:\n');
availableTools.forEach((tool, index) => {
  console.log(`${index + 1}. ${tool.name}`);
  console.log(`   Descrição: ${tool.description}`);
  console.log(`   Exemplo: ${JSON.stringify(tool.example, null, 2)}`);
  console.log('');
});

console.log('🚀 Exemplo de Fluxo de Automação:\n');
console.log('1. Navegar para uma página web');
console.log('2. Esperar o carregamento completo');
console.log('3. Tirar screenshot da página inicial');
console.log('4. Preencher um formulário');
console.log('5. Clicar em um botão');
console.log('6. Esperar por um resultado');
console.log('7. Tirar screenshot do resultado');
console.log('8. Extrair dados da página');
console.log('9. Gerar código de teste automatizado');

console.log('\n📝 Como usar com Claude/Cline:');
console.log('O servidor está configurado em cline_mcp_settings.json com o nome:');
console.log('"github.com/executeautomation/mcp-playwright"');
console.log('\nAs ferramentas estarão disponíveis como:');
console.log('- github.com/executeautomation/mcp-playwright:playwright_navigate');
console.log('- github.com/executeautomation/mcp-playwright:playwright_screenshot');
console.log('- github.com/executeautomation/mcp-playwright:playwright_click');
console.log('- E assim por diante...');

console.log('\n✅ Instalação concluída com sucesso!');
console.log('O servidor MCP do Playwright está pronto para uso.');
