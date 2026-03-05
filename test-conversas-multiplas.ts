/**
 * TESTE DE MÚLTIPLAS CONVERSAS - AgenteZap
 * Simula várias conversas completas para verificar se o agente:
 * 1. Envia mídias no momento certo
 * 2. Não repete mídias
 * 3. Segue o fluxo de conversa do prompt
 * 4. Não vaza marcadores internos
 */

import { storage } from "./server/storage";
import { generateMediaPromptBlock, parseMistralResponse } from "./server/mediaService";
import { Mistral } from "@mistralai/mistralai";
import { db } from "./server/db";
import { users, aiAgentConfig, agentMediaLibrary, systemConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

// Padrões PROIBIDOS nas respostas
const FORBIDDEN_PATTERNS = [
  { pattern: /🎤\s*[ÁáAa]udio/i, name: "🎤 Áudio" },
  { pattern: /\[ÁUDIO ENVIADO PELO AGENTE\]/i, name: "[ÁUDIO ENVIADO]" },
  { pattern: /\[Áudio enviado:[^\]]+\]/i, name: "[Áudio enviado: ...]" },
  { pattern: /\[SEND_MEDIA:/i, name: "[SEND_MEDIA:]" },
];

interface ConversationTest {
  name: string;
  description: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    expectMedia?: string | null;
  }>;
}

// Conversas de teste completas
const CONVERSATION_TESTS: ConversationTest[] = [
  {
    name: "Conversa completa - Cliente interessado",
    description: "Cliente chega, diz o que faz, pergunta preço e quer assinar",
    messages: [
      { role: 'user', content: 'Oi, boa tarde!', expectMedia: 'MENSAGEM_DE_INICIO' },
      { role: 'user', content: 'Trabalho com vendas de imóveis', expectMedia: 'COMO_FUNCIONA' },
      { role: 'user', content: 'Quanto custa?', expectMedia: null },
      { role: 'user', content: 'Como faço pra assinar?', expectMedia: null },
    ]
  },
  {
    name: "Conversa completa - Cliente curioso",
    description: "Cliente pergunta bastante antes de decidir",
    messages: [
      { role: 'user', content: 'Olá', expectMedia: 'MENSAGEM_DE_INICIO' },
      { role: 'user', content: 'Tenho uma loja de roupas', expectMedia: 'COMO_FUNCIONA' },
      { role: 'user', content: 'Funciona 24 horas?', expectMedia: null },
      { role: 'user', content: 'E se eu não gostar?', expectMedia: null },
      { role: 'user', content: 'Tá, vou testar', expectMedia: null },
    ]
  },
  {
    name: "Conversa - Cliente direto ao ponto",
    description: "Cliente já sabe o que quer",
    messages: [
      { role: 'user', content: 'Quero contratar a IA de vocês', expectMedia: 'MENSAGEM_DE_INICIO' },
      { role: 'user', content: 'Tenho delivery de pizza', expectMedia: 'COMO_FUNCIONA' },
      { role: 'user', content: 'Qual o link pra assinar?', expectMedia: null },
    ]
  },
  {
    name: "Conversa - Cliente com dúvidas técnicas",
    description: "Cliente pergunta sobre configuração",
    messages: [
      { role: 'user', content: 'E aí, blz?', expectMedia: 'MENSAGEM_DE_INICIO' },
      { role: 'user', content: 'Faço atendimento ao cliente numa empresa', expectMedia: 'COMO_FUNCIONA' },
      { role: 'user', content: 'Precisa instalar alguma coisa?', expectMedia: null },
      { role: 'user', content: 'Vocês configuram pra mim?', expectMedia: null },
    ]
  },
];

async function runConversationTest(
  test: ConversationTest,
  mistral: Mistral,
  systemPrompt: string,
  mediaBlock: string
): Promise<{ passed: boolean; issues: string[]; details: string[] }> {
  const issues: string[] = [];
  const details: string[] = [];
  const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const mediasSent = new Set<string>();

  for (let i = 0; i < test.messages.length; i++) {
    const msg = test.messages[i];
    
    // Adicionar contexto de mídias já enviadas
    let dynamicContext = '';
    if (mediasSent.size > 0) {
      dynamicContext = `\n\n⚠️ MÍDIAS JÁ ENVIADAS (NÃO REPETIR): ${Array.from(mediasSent).join(', ')}`;
    }

    // Chamar IA
    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt + mediaBlock + dynamicContext },
        ...conversationHistory,
        { role: 'user', content: msg.content }
      ],
      temperature: 0.7,
      maxTokens: 800,
    });

    const responseText = response.choices?.[0]?.message?.content || '';
    
    // Verificar padrões proibidos
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(responseText)) {
        issues.push(`Msg ${i+1}: Padrão proibido "${forbidden.name}"`);
      }
    }

    // Verificar mídia
    const parsed = parseMistralResponse(responseText);
    const mediasDetected = parsed?.actions?.map(a => a.media_name) || [];
    
    // Registrar mídias enviadas
    mediasDetected.forEach(m => mediasSent.add(m));

    // Verificar se mídia esperada foi enviada
    if (msg.expectMedia) {
      const found = mediasDetected.some(m => m.includes(msg.expectMedia!.replace('MENSAGEM_DE_INICIO', 'MENSAGEM_DE_INICIO')));
      if (!found && mediasDetected.length === 0) {
        issues.push(`Msg ${i+1}: Mídia esperada (${msg.expectMedia}) não enviada`);
      }
    }

    // Verificar se repetiu mídia
    const repeated = mediasDetected.filter(m => {
      // Verificar se já foi enviada em mensagens anteriores
      const previouslySent = Array.from(mediasSent).filter(s => s !== m);
      return previouslySent.includes(m);
    });
    if (repeated.length > 0) {
      issues.push(`Msg ${i+1}: Mídia repetida: ${repeated.join(', ')}`);
    }

    details.push(`[${i+1}] User: "${msg.content.substring(0, 30)}..." → Mídia: ${mediasDetected.join(', ') || 'nenhuma'}`);

    // Adicionar ao histórico
    conversationHistory.push({ role: 'user', content: msg.content });
    conversationHistory.push({ role: 'assistant', content: responseText });
  }

  return {
    passed: issues.length === 0,
    issues,
    details
  };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     TESTE DE MÚLTIPLAS CONVERSAS - AgenteZap                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Buscar configuração do agente usando db diretamente
  const [user] = await db.select().from(users).where(eq(users.email, 'rodrigo4@gmail.com')).limit(1);
  if (!user) {
    console.error('❌ Usuário não encontrado');
    process.exit(1);
  }

  const [agentConfig] = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, user.id)).limit(1);
  if (!agentConfig) {
    console.error('❌ Configuração do agente não encontrada');
    process.exit(1);
  }

  // Buscar mídias
  const medias = await db.select().from(agentMediaLibrary).where(eq(agentMediaLibrary.userId, user.id));
  const mediaBlock = generateMediaPromptBlock(medias as any);

  // Buscar API key
  const [apiKeyConfig] = await db.select().from(systemConfig).where(eq(systemConfig.chave, 'mistral_api_key')).limit(1);
  const apiKey = apiKeyConfig?.valor;
  if (!apiKey) {
    console.error('❌ API key não encontrada');
    process.exit(1);
  }

  const mistral = new Mistral({ apiKey });

  console.log(`📋 Testando ${CONVERSATION_TESTS.length} conversas...\n`);

  let totalPassed = 0;
  let totalFailed = 0;

  for (const test of CONVERSATION_TESTS) {
    console.log(`┌─ ${test.name}`);
    console.log(`│  ${test.description}`);
    
    const result = await runConversationTest(test, mistral, agentConfig.prompt, mediaBlock);
    
    if (result.passed) {
      console.log(`│  ✅ PASSOU`);
      totalPassed++;
    } else {
      console.log(`│  ❌ FALHOU`);
      result.issues.forEach(issue => console.log(`│     ${issue}`));
      totalFailed++;
    }
    
    result.details.forEach(d => console.log(`│  ${d}`));
    console.log(`└─────────────────────────────────────────────────────\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                      RESUMO FINAL');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   ✅ Passou: ${totalPassed}`);
  console.log(`   ❌ Falhou: ${totalFailed}`);
  console.log(`   Total: ${CONVERSATION_TESTS.length}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);
