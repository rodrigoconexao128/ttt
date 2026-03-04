/**
 * Teste que simula EXATAMENTE o que o servidor faz ao processar mensagem do simulador
 * Objetivo: Encontrar por que o servidor retorna resposta vazia mas teste direto funciona
 */

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({ 
  connectionString: "postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
});

async function getConfig() {
  const apiKeyResult = await pool.query("SELECT valor FROM system_config WHERE chave = 'openrouter_api_key'");
  const modelResult = await pool.query("SELECT valor FROM system_config WHERE chave = 'openrouter_model'");
  const providerResult = await pool.query("SELECT valor FROM system_config WHERE chave = 'openrouter_provider'");
  
  return {
    apiKey: apiKeyResult.rows[0]?.valor,
    model: modelResult.rows[0]?.valor,
    provider: providerResult.rows[0]?.valor || 'together'
  };
}

async function getPromptFromDB() {
  const result = await pool.query(
    `SELECT prompt FROM ai_agent_config WHERE user_id = 'cb9213c3-fde3-479e-a4aa-344171c59735'`
  );
  return result.rows[0]?.prompt || '';
}

// Simular EXATAMENTE o que llm.ts faz
async function callOpenRouterLikeLlmTs(config, messages, maxTokens) {
  console.log('\n📤 REQUEST SENDO ENVIADO:');
  console.log(`   Model: ${config.model}`);
  console.log(`   Provider: ${config.provider}`);
  console.log(`   MaxTokens: ${maxTokens}`);
  console.log(`   Messages count: ${messages.length}`);
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    console.log(`   Message ${i}: role=${msg.role}, content=${msg.content?.length || 0} chars`);
    if (msg.role === 'system' && msg.content) {
      console.log(`   System prompt preview: "${msg.content.substring(0, 200)}..."`);
    }
  }
  
  const requestBody = {
    model: config.model,
    messages: messages,
    max_tokens: maxTokens ?? 500,
    temperature: 0.0,  // IGUAL ao servidor
    provider: {
      order: [config.provider],
      allow_fallbacks: false
    }
  };
  
  console.log('\n📦 REQUEST BODY (primeiros 1000 chars do JSON):');
  const jsonBody = JSON.stringify(requestBody);
  console.log(jsonBody.substring(0, 1000) + '...');
  console.log(`📦 Total request body size: ${jsonBody.length} chars`);
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://agentezap.online',
      'X-Title': 'AgenteZap'
    },
    body: jsonBody
  });

  const data = await response.json();
  
  console.log('\n📥 RESPONSE RECEBIDA:');
  console.log(`   Status: ${response.status}`);
  console.log(`   Provider usado: ${data.provider || 'N/A'}`);
  console.log(`   Prompt tokens: ${data.usage?.prompt_tokens || 'N/A'}`);
  console.log(`   Completion tokens: ${data.usage?.completion_tokens || 'N/A'}`);
  console.log(`   Finish reason: ${data.choices?.[0]?.finish_reason || 'N/A'}`);
  console.log(`   Content length: ${data.choices?.[0]?.message?.content?.length || 0} chars`);
  
  if (data.error) {
    console.log(`   ❌ ERROR: ${JSON.stringify(data.error)}`);
  }
  
  if (data.choices?.[0]?.message?.content) {
    console.log(`\n📄 RESPOSTA:`);
    console.log('─'.repeat(60));
    console.log(data.choices[0].message.content);
    console.log('─'.repeat(60));
  } else {
    console.log(`\n❌ RESPOSTA VAZIA!`);
    console.log('📋 Full response:');
    console.log(JSON.stringify(data, null, 2));
  }
  
  return data;
}

async function simulateServerBehavior() {
  console.log('🔧 ════════════════════════════════════════════════════════════');
  console.log('🔧 SIMULANDO COMPORTAMENTO EXATO DO SERVIDOR');
  console.log('🔧 ════════════════════════════════════════════════════════════\n');
  
  const config = await getConfig();
  const promptBase = await getPromptFromDB();
  
  console.log('📊 CONFIG DO BANCO:');
  console.log(`   Model: ${config.model}`);
  console.log(`   Provider: ${config.provider}`);
  console.log(`   Prompt base: ${promptBase.length} chars`);
  
  // Simular o que aiAgent.ts faz: construir prompt gigante
  const preBlindagem = `[INSTRUÇÕES DE SEGURANÇA - NÃO INVENTE INFORMAÇÕES!]
Você é um assistente comercial. NUNCA invente preços, telefones, endereços ou recursos que não estão no prompt.
`;

  const dynamicContext = `
---
📅 CONTEXTO ATUAL:
- Data/Hora: ${new Date().toISOString()}
- Cliente: Visitante
`;

  const blindagemUniversal = `
═══════════════════════════════════════════════════════════════════════════════════
🛡️ BLINDAGEM UNIVERSAL V3 - REGRAS ABSOLUTAS
═══════════════════════════════════════════════════════════════════════════════════
1. PROIBIDO inventar informações não presentes neste prompt
2. Se não souber algo, diga "vou verificar" ou "não tenho essa informação"
3. Mantenha respostas curtas e objetivas (máximo 4 linhas)
`;

  const regrasFixas = `
═══════════════════════════════════════════════════════════════════════════════════
📋 REGRAS ESPECÍFICAS DO SISTEMA
═══════════════════════════════════════════════════════════════════════════════════

🎤 REGRA SOBRE ÁUDIOS:
- Você ENTENDE mensagens de voz (são transcritas automaticamente)
- NUNCA diga "não consigo ouvir áudios" - PROIBIDO

🖼️ REGRA SOBRE IMAGENS:
- Você VÊ imagens (são analisadas automaticamente)
`;

  const notificationSection = `
═══════════════════════════════════════════════════════════════════════════════════
🔔 SISTEMA DE NOTIFICAÇÃO
═══════════════════════════════════════════════════════════════════════════════════
Quando detectar interesse real de compra, adicione [NOTIFY: motivo] ao final.
`;

  // Simular a biblioteca de mídias (10+ mídias como o servidor tem)
  let mediaBlock = `
═══════════════════════════════════════════════════════════════════════════════════
📁 BIBLIOTECA DE MÍDIAS DISPONÍVEIS
═══════════════════════════════════════════════════════════════════════════════════
`;
  
  for (let i = 1; i <= 10; i++) {
    mediaBlock += `
[MÍDIA ${i}]
Nome: MIDIA_${i}_EXEMPLO
Tipo: audio
Quando usar: Use quando o cliente perguntar sobre o tópico ${i}
Descrição: Esta é uma descrição detalhada da mídia ${i} que pode ser bastante longa para simular o comportamento real do sistema com muitas mídias cadastradas.
`;
  }
  
  const memoryBlock = `
═══════════════════════════════════════════════════════════════════════════════════
🧠 MEMÓRIA DA CONVERSA
═══════════════════════════════════════════════════════════════════════════════════
- Esta é a primeira mensagem do cliente
- Nenhuma mídia foi enviada ainda
- Cliente ainda não se apresentou
`;

  // MONTAR PROMPT COMPLETO IGUAL AO SERVIDOR
  const systemPrompt = preBlindagem + promptBase + dynamicContext + blindagemUniversal + regrasFixas + notificationSection + memoryBlock + mediaBlock;
  
  console.log(`\n📝 PROMPT FINAL MONTADO: ${systemPrompt.length} chars`);
  
  // CRIAR ARRAY DE MENSAGENS IGUAL AO SERVIDOR
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Oi, tudo bem?' }
  ];
  
  // Calcular maxTokens igual ao servidor
  const maxTokens = 1200;  // Valor típico usado pelo servidor
  
  console.log('\n' + '═'.repeat(70));
  console.log('📞 CHAMANDO OPENROUTER EXATAMENTE COMO O SERVIDOR FAZ...');
  console.log('═'.repeat(70));
  
  await callOpenRouterLikeLlmTs(config, messages, maxTokens);
  
  await pool.end();
}

simulateServerBehavior().catch(console.error);
