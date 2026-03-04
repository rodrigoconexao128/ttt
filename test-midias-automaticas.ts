/**
 * TESTE: Sistema de Mídias Automático
 * 
 * Testa se as mídias são enviadas AUTOMATICAMENTE baseadas no campo "when_to_use"
 * SEM precisar ter instruções no prompt do cliente
 */

import 'dotenv/config';
import { db } from "./server/db";
import { users, aiAgentConfig, agentMediaLibrary, systemConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { generateMediaPromptBlock, parseMistralResponse } from "./server/mediaService";
import { Mistral } from "@mistralai/mistralai";

// Prompt SIMPLES sem instruções de mídia
const PROMPT_LIMPO = `# AGENTE RODRIGO - AgenteZap

## IDENTIDADE
Você é Rodrigo, atendente virtual da AgenteZap. Somos uma IA de atendimento humanizado para WhatsApp (SaaS).

## TOM DE CONVERSA
- Humano, natural, profissional
- Frases curtas, linguagem simples
- Usa "né?", "tá?", "entendeu?" naturalmente
- Tom de ajuda, não de venda

## FLUXO DE CONVERSA
1. Cliente manda primeira mensagem:
   - Cumprimente usando o nome se disponível
   - Pergunte com o que trabalha

2. Cliente responde o que faz:
   - Explique que a AgenteZap funciona como um atendente
   - É como ter um funcionário treinado 24h

3. Direcione para assinatura:
   - Site: agentezap.online
   - Plano: R$ 99/mês ilimitado
   - Implementação opcional: R$ 700

## INFORMAÇÕES DO PLANO
- Plano ilimitado: R$ 99/mês
- Inclui: IA, Follow-up, Notificador, Mídias, Qualificação, Campanhas
- Implementação opcional: R$ 700 (30 dias)
- Site: agentezap.online

## PROIBIÇÕES
- Nunca usar termos técnicos (GPT, LLM, API)
- Nunca pressionar cliente
- Nunca parecer robô

Use {{nome}} para inserir o nome do cliente`;

// Cenários de teste
const CENARIOS = [
  {
    nome: "Primeira mensagem - Oi",
    mensagem: "Oi, boa tarde!",
    expectMidia: "MENSAGEM_DE_INICIO"
  },
  {
    nome: "Primeira mensagem - Olá",
    mensagem: "Olá!",
    expectMidia: "MENSAGEM_DE_INICIO"
  },
  {
    nome: "Cliente diz que trabalha com vendas",
    mensagem: "Trabalho com vendas de imóveis",
    historico: [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Oi! Tudo bem? Me conta, você trabalha com o quê?' }
    ],
    expectMidia: "COMO_FUNCIONA"
  },
  {
    nome: "Cliente diz que trabalha com atendimento",
    mensagem: "Faço atendimento ao cliente",
    historico: [
      { role: 'user', content: 'Olá' },
      { role: 'assistant', content: 'Olá! Prazer! Me conta, com o que você trabalha?' }
    ],
    expectMidia: "COMO_FUNCIONA"
  },
  {
    nome: "Cliente pergunta preço (não deve enviar mídia)",
    mensagem: "Quanto custa?",
    historico: [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Oi! Me conta, com o que você trabalha?' },
      { role: 'user', content: 'Vendas' },
      { role: 'assistant', content: 'Perfeito! A AgenteZap funciona como um atendente seu.' }
    ],
    expectMidia: null
  }
];

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   TESTE: MÍDIAS AUTOMÁTICAS (SEM INSTRUÇÕES NO PROMPT)          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Buscar usuário
  const [user] = await db.select().from(users).where(eq(users.email, 'rodrigo4@gmail.com')).limit(1);
  if (!user) {
    console.error('❌ Usuário não encontrado');
    process.exit(1);
  }

  // Buscar mídias
  const medias = await db.select().from(agentMediaLibrary).where(eq(agentMediaLibrary.userId, user.id));
  console.log(`📁 Mídias encontradas: ${medias.length}`);
  for (const m of medias) {
    console.log(`   - ${m.name}`);
    console.log(`     📌 Quando usar: ${m.whenToUse?.substring(0, 60)}...`);
  }

  // Gerar bloco de mídia
  const mediaBlock = generateMediaPromptBlock(medias as any);
  console.log(`\n📝 Bloco de mídia gerado: ${mediaBlock.length} caracteres\n`);

  // Buscar API key
  const [apiKeyConfig] = await db.select().from(systemConfig).where(eq(systemConfig.chave, 'mistral_api_key')).limit(1);
  if (!apiKeyConfig?.valor) {
    console.error('❌ API key não encontrada');
    process.exit(1);
  }

  const mistral = new Mistral({ apiKey: apiKeyConfig.valor });

  // Testar cada cenário
  let passou = 0;
  let falhou = 0;

  for (const cenario of CENARIOS) {
    console.log(`\n┌─ ${cenario.nome}`);
    console.log(`│  Mensagem: "${cenario.mensagem}"`);

    // Montar histórico
    const historico = cenario.historico || [];
    
    // Montar prompt completo (prompt limpo + bloco de mídia)
    const promptCompleto = PROMPT_LIMPO + mediaBlock;

    try {
      const response = await mistral.chat.complete({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: promptCompleto },
          ...historico,
          { role: 'user', content: cenario.mensagem }
        ],
        temperature: 0.7,
        maxTokens: 600,
      });

      const resposta = response.choices?.[0]?.message?.content || '';
      
      // Verificar mídia
      const parsed = parseMistralResponse(resposta);
      const midiasDetectadas = parsed?.actions?.map(a => a.media_name) || [];

      let status = '✅ PASSOU';
      let problema = '';

      if (cenario.expectMidia) {
        const encontrou = midiasDetectadas.some(m => m.includes(cenario.expectMidia!));
        if (!encontrou) {
          status = '❌ FALHOU';
          problema = `Esperava mídia ${cenario.expectMidia} mas não encontrou`;
          falhou++;
        } else {
          passou++;
        }
      } else {
        if (midiasDetectadas.length > 0) {
          status = '⚠️ AVISO';
          problema = `Não esperava mídia mas encontrou: ${midiasDetectadas.join(', ')}`;
        }
        passou++;
      }

      console.log(`│  ${status}`);
      if (problema) console.log(`│  ${problema}`);
      console.log(`│  Resposta: ${resposta.substring(0, 100)}...`);
      if (midiasDetectadas.length > 0) {
        console.log(`│  📁 Mídias: ${midiasDetectadas.join(', ')}`);
      }
      console.log(`└─────────────────────────────────────────────────────`);

    } catch (error: any) {
      console.log(`│  ❌ ERRO: ${error.message}`);
      console.log(`└─────────────────────────────────────────────────────`);
      falhou++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         RESUMO');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   ✅ Passou: ${passou}`);
  console.log(`   ❌ Falhou: ${falhou}`);
  console.log(`   Total: ${CENARIOS.length}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(console.error);
