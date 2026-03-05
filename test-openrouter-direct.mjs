/**
 * Teste direto do modelo google/gemma-3n-e4b-it com prompt grande
 * Para verificar se o modelo aguenta prompts de 9K+ tokens
 */

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({ 
  connectionString: "postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
});

async function getOpenRouterKey() {
  const result = await pool.query("SELECT valor FROM system_config WHERE chave = 'openrouter_api_key'");
  return result.rows[0]?.valor;
}

async function getPromptFromDB() {
  // Buscar o prompt completo do rodrigo4
  const result = await pool.query(
    `SELECT prompt FROM ai_agent_config WHERE user_id = 'cb9213c3-fde3-479e-a4aa-344171c59735'`
  );
  return result.rows[0]?.prompt || '';
}

async function testDirectOpenRouter(apiKey, systemPrompt, userMessage) {
  console.log('\n🧪 ════════════════════════════════════════════════════════════');
  console.log('🧪 TESTE DIRETO DO OPENROUTER');
  console.log('🧪 ════════════════════════════════════════════════════════════');
  console.log(`📝 System prompt: ${systemPrompt.length} chars`);
  console.log(`📝 User message: ${userMessage}`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap Test'
      },
      body: JSON.stringify({
        model: 'google/gemma-3n-e4b-it',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 1200,
        temperature: 0.3,
        provider: {
          order: ['together']
        }
      })
    });

    const elapsed = Date.now() - startTime;
    const data = await response.json();
    
    console.log(`\n⏱️ Tempo: ${elapsed}ms`);
    console.log(`📊 Status HTTP: ${response.status}`);
    
    if (data.error) {
      console.log(`❌ ERRO: ${JSON.stringify(data.error)}`);
      return;
    }

    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    const finishReason = data.choices?.[0]?.finish_reason || 'N/A';
    
    console.log(`\n📊 Tokens usados:`);
    console.log(`   - Prompt: ${usage.prompt_tokens || 'N/A'}`);
    console.log(`   - Completion: ${usage.completion_tokens || 'N/A'}`);
    console.log(`   - Total: ${usage.total_tokens || 'N/A'}`);
    console.log(`\n🏁 Finish reason: ${finishReason}`);
    console.log(`\n📄 Resposta (${content.length} chars):`);
    console.log('─'.repeat(60));
    console.log(content || '(VAZIO)');
    console.log('─'.repeat(60));
    
    // Resultado final
    if (content && content.length > 0) {
      console.log('\n✅ SUCESSO! O modelo respondeu corretamente.');
    } else {
      console.log('\n❌ FALHOU! Resposta vazia.');
      console.log('📋 Resposta completa da API:');
      console.log(JSON.stringify(data, null, 2));
    }
    
    return { content, usage, finishReason };
    
  } catch (error) {
    console.error(`❌ Erro: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('🚀 Iniciando teste direto do OpenRouter...\n');
  
  // Buscar chave da API
  const apiKey = await getOpenRouterKey();
  if (!apiKey) {
    console.error('❌ Chave OpenRouter não encontrada!');
    process.exit(1);
  }
  console.log('✅ Chave OpenRouter encontrada');
  
  // Buscar prompt do banco
  const dbPrompt = await getPromptFromDB();
  console.log(`✅ Prompt do banco: ${dbPrompt.length} chars`);
  
  // ============================================
  // TESTE 1: Prompt pequeno (deve funcionar)
  // ============================================
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('📋 TESTE 1: Prompt pequeno (500 chars)');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const smallPrompt = `Você é RODRIGO, consultor de vendas da AgenteZap.
## REGRAS:
1. PREÇO: R$49/mês com código PARC2026PROMO
2. LINK: https://agentezap.online
3. Seja breve e objetivo`;

  await testDirectOpenRouter(apiKey, smallPrompt, 'Oi, tudo bem?');
  
  // ============================================
  // TESTE 2: Prompt médio (10K chars)
  // ============================================
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('📋 TESTE 2: Prompt do banco (10K chars)');
  console.log('═══════════════════════════════════════════════════════════════');
  
  await testDirectOpenRouter(apiKey, dbPrompt, 'Oi, tudo bem?');
  
  // ============================================
  // TESTE 3: Prompt grande simulando o servidor (33K chars)
  // ============================================
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('📋 TESTE 3: Prompt grande simulando servidor (~33K chars)');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Simular os extras que o servidor adiciona
  const extras = `

---

## CONTEXTO DINÂMICO
- Data/hora atual: ${new Date().toISOString()}
- Nome do cliente: Visitante

## BLINDAGEM UNIVERSAL V3
[Várias regras de segurança e anti-alucinação aqui...]
${'REGRA DE SEGURANÇA IMPORTANTE: Não invente informações. '.repeat(100)}

## REGRAS SOBRE ÁUDIOS E IMAGENS
- Você ENTENDE mensagens de voz
- Você VÊ imagens

## SISTEMA DE NOTIFICAÇÃO
Quando detectar interesse de compra, notifique.

## BIBLIOTECA DE MÍDIAS
${'[MÍDIA: video_apresentacao.mp4 - Use quando o cliente pedir demonstração]\n'.repeat(50)}

## MEMÓRIA DA CONVERSA
Esta é a primeira mensagem do cliente.
`;

  const largePrompt = dbPrompt + extras;
  console.log(`📝 Prompt total: ${largePrompt.length} chars (simulando servidor)`);
  
  await testDirectOpenRouter(apiKey, largePrompt, 'Oi, tudo bem?');
  
  await pool.end();
  console.log('\n\n🏁 Testes finalizados!');
}

main().catch(console.error);
