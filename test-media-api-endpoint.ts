/**
 * Teste da API de Teste de Agente para verificar envio de mídias
 * 
 * Este script faz uma chamada direta à API /api/test-agent/message
 * para verificar se as mídias são retornadas corretamente
 */

import 'dotenv/config';
import './server/db'; // Inicializa conexão com o banco

async function testMediaEndpoint() {
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('     TESTE DE API DE MÍDIAS - ENDPOINT DIRETO');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  // Importar serviços necessários
  const { db } = await import('./server/db');
  const { users, testTokens, agentMediaLibrary } = await import('@shared/schema');
  const { eq, and } = await import('drizzle-orm');
  const { handleTestAgentMessage } = await import('./server/testAgentService');
  const { getMistralClient } = await import('./server/mistralClient');
  const { 
    getAgentMediaLibrary, 
    generateMediaPromptBlock,
    executeMediaActions 
  } = await import('./server/mediaService');
  const { parseMistralResponse } = await import('./server/llm');
  
  // Buscar usuário rodrigo4
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'rodrigo4@gmail.com'))
    .limit(1);
  
  if (!user) {
    console.error('❌ Usuário rodrigo4@gmail.com não encontrado');
    process.exit(1);
  }
  
  console.log(`✅ Usuário: ${user.email}`);
  console.log(`   ID: ${user.id}\n`);
  
  // Buscar token de teste existente ou criar um
  let [testToken] = await db
    .select()
    .from(testTokens)
    .where(eq(testTokens.userId, user.id))
    .limit(1);
  
  if (!testToken) {
    console.log('⚠️ Token de teste não encontrado, criando...');
    const token = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    [testToken] = await db
      .insert(testTokens)
      .values({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();
  }
  
  console.log(`✅ Token de teste: ${testToken.token}`);
  
  // Buscar mídias do usuário
  const medias = await db
    .select()
    .from(agentMediaLibrary)
    .where(and(
      eq(agentMediaLibrary.userId, user.id),
      eq(agentMediaLibrary.isActive, true)
    ));
  
  console.log(`📁 Mídias disponíveis: ${medias.length}`);
  medias.forEach(m => {
    console.log(`   - ${m.name} (${m.mediaType})`);
  });
  
  // Dependências para o handleTestAgentMessage
  const deps = {
    getTestToken: async (token: string) => {
      const [t] = await db
        .select()
        .from(testTokens)
        .where(eq(testTokens.token, token))
        .limit(1);
      if (!t) return undefined;
      return { userId: t.userId };
    },
    getAgentConfig: async (userId: string) => {
      const { aiAgentConfig } = await import('@shared/schema');
      const [config] = await db
        .select()
        .from(aiAgentConfig)
        .where(eq(aiAgentConfig.userId, userId))
        .limit(1);
      return config ? { prompt: config.prompt, model: config.model } : undefined;
    },
    getMistralClient: getMistralClient,
    processAdminMessage: async () => null, // Não usado neste teste
    getAgentMediaLibrary,
    generateMediaPromptBlock,
    parseMistralResponse,
  };
  
  // Cenários de teste
  const testScenarios = [
    {
      name: 'Primeira mensagem (Oi)',
      message: 'Oi',
      expectedMedia: 'MENSAGEM_DE_INICIO',
    },
    {
      name: 'Pergunta sobre CRM',
      message: 'Vocês tem CRM?',
      expectedMedia: 'KANBAN_CRM',
    },
    {
      name: 'Pergunta sobre Follow-up',
      message: 'Como faço follow-up?',
      expectedMedia: 'FOLLOWP_INTELIGENTE',
    },
  ];
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Testando cenários via handleTestAgentMessage...\n');
  
  for (const scenario of testScenarios) {
    console.log(`\n🧪 ${scenario.name}`);
    console.log(`   Mensagem: "${scenario.message}"`);
    console.log(`   Mídia esperada: ${scenario.expectedMedia}`);
    
    try {
      const result = await handleTestAgentMessage(
        {
          message: scenario.message,
          token: testToken.token,
          history: [],
          sentMedias: [],
        },
        deps
      );
      
      console.log(`   ✅ Resposta recebida (${result.response.length} chars)`);
      
      if (result.mediaActions && Array.isArray(result.mediaActions) && result.mediaActions.length > 0) {
        console.log(`   📁 MÍDIAS RETORNADAS: ${result.mediaActions.length}`);
        for (const media of result.mediaActions) {
          console.log(`      - ${media.type}: ${media.name || media.url?.substring(0, 50)}`);
        }
      } else {
        console.log(`   ⚠️ Nenhuma mídia retornada`);
      }
      
    } catch (error: any) {
      console.log(`   ❌ Erro: ${error.message}`);
    }
    
    // Delay entre testes para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('     TESTE CONCLUÍDO');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  process.exit(0);
}

testMediaEndpoint().catch(error => {
  console.error('Erro fatal:', error);
  process.exit(1);
});
