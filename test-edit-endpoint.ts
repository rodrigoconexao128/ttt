/**
 * Teste do endpoint /api/agent/edit-prompt
 */

const BASE_URL = 'http://localhost:5000';

async function testEditEndpoint() {
  console.log('🧪 TESTE: /api/agent/edit-prompt\n');
  
  const testPrompt = `# Agente de Vendas
Você é a Ana, assistente da Clínica Beleza Pura.

## Saudação
Olá! Bem-vindo à Clínica Beleza Pura.

## Produtos
- Botox: R$ 800
- Preenchimento: R$ 1.200

## Contato
WhatsApp: (11) 98765-4321`;

  const testInstruction = "O nome da clínica mudou para Amor e Bem Estar";
  
  try {
    console.log('📤 Enviando requisição...');
    console.log(`📝 Instrução: "${testInstruction}"\n`);
    
    const response = await fetch(`${BASE_URL}/api/agent/edit-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Você precisará adicionar um cookie de sessão válido aqui
      },
      body: JSON.stringify({
        currentPrompt: testPrompt,
        instruction: testInstruction
      })
    });
    
    console.log(`📡 Status: ${response.status} ${response.statusText}`);
    
    const text = await response.text();
    console.log(`📄 Response body (raw):\n${text}\n`);
    
    if (response.ok) {
      const data = JSON.parse(text);
      console.log('✅ SUCESSO!');
      console.log(`\n🤖 Resposta da IA: ${data.feedbackMessage}`);
      console.log(`\n📊 Stats: ${data.stats?.aplicadas || 0} aplicadas, ${data.stats?.falharam || 0} falharam`);
      console.log(`\n📝 Prompt editado:\n${data.newPrompt}`);
    } else {
      console.log('❌ ERRO!');
      try {
        const error = JSON.parse(text);
        console.log('Mensagem:', error.message);
      } catch {
        console.log('Resposta não é JSON');
      }
    }
    
  } catch (error: any) {
    console.error('❌ Erro na requisição:', error.message);
  }
}

testEditEndpoint();
