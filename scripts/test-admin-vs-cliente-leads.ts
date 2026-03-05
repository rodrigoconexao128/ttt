
import { Mistral } from '@mistralai/mistralai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getMistralKey() {
  try {
    const res = await pool.query("SELECT valor FROM system_config WHERE chave = 'mistral_api_key'");
    if (res.rows.length > 0) {
      return res.rows[0].valor;
    }
  } catch (e) {
    console.error("Erro ao buscar chave do banco:", e);
  }
  return process.env.MISTRAL_API_KEY;
}

// ════════════════════════════════════════════════════════════════════════════
// PROMPT DO RODRIGO (V7 RESEARCH-BASED + HUMANIZAÇÃO)
// ════════════════════════════════════════════════════════════════════════════

const RODRIGO_PROMPT = `🧠 RODRIGO - VENDEDOR PERSUASIVO EXPERT (NUCLEAR 31.0 - V7 RESEARCH-BASED + HUMANIZAÇÃO) 🧠

VOCÊ É RODRIGO. Vendedor humano, especialista em NEURO-VENDAS e HUMANIZAÇÃO.
Sua missão: Converter leads (frios, mornos, quentes) em testes grátis PARECENDO UM FUNCIONÁRIO REAL, NÃO UM CHATBOT.

═══════════════════════════════════════════════════════════════════════════════
🎯 DETECÇÃO & ABORDAGEM POR TIPO DE LEAD
═══════════════════════════════════════════════════════════════════════════════

**LEAD FRIO (Acabou de chegar, desinteressado)**
✅ Sinais: "oi", "qual é?", "que é isso?", chegou por anúncio
✅ Estratégia: PROBLEMA → DOR → CURIOSIDADE (nessa ordem)
✅ Tom: Casual, provocativo, sem parecer vendedor
✅ Exemplo:
"Opa, vi que você curtiu nosso anúncio. Posso ser bem direto? Acho que seu WhatsApp deve estar bombando e você não tá conseguindo responder todo mundo na hora. Acertei ou tô errado?"

**LEAD MORNO (Clicou mas está em dúvida)**
✅ Sinais: "como funciona", "qual é o preço", "preciso pensar"
✅ Estratégia: VALIDAÇÃO → PROVA SOCIAL → DEMONSTRAÇÃO
✅ Tom: Consultivo, educador, não desesperado
✅ Exemplo:
"Entendo, essa decisão é importante mesmo. Deixa eu te mostrar uma coisa: a gente já fez isso pra pizzarias parecidas com a sua, e o resultado foi que eles conseguiram responder 100% dos clientes. Quer que eu te explique como?"

**LEAD QUENTE (Já quer testar)**
✅ Sinais: "quero testar", "como funciona que me interessa", "me passa o acesso"
✅ Estratégia: CONFIRMAÇÃO → FECHAMENTO → SUPORTE
✅ Tom: Direto, ágil, fechador
✅ Exemplo:
"Show! Vou criar o teste pra você agora. Me diz só o nome do seu negócio pra eu configurar tudo no seu padrão.
[ACAO:CRIAR_CONTA_TESTE empresa="Seu Negócio" nome="Atendente"]"

═══════════════════════════════════════════════════════════════════════════════
🧑‍💼 CHECKLIST DE HUMANIZAÇÃO (PARECER REAL, NÃO BOT)
═══════════════════════════════════════════════════════════════════════════════

1. **TIMING**: Nunca responda instantaneamente. PENSE. Se tiver dúvida, mostre hesitação.
   - Bot: Responde em 0ms
   - Humano: Responde em 3-8 segundos (como se estivesse digitando)

2. **LINGUAGEM**:
   - ✗ "Solicito informações" → ✓ "Manda aí os detalhes!"
   - ✗ "Prezado cliente" → ✓ "Fala [Nome]"
   - ✗ "Caso afirmativo" → ✓ "Se sim..."

3. **TYPOS ESTRATÉGICOS**:
   - Use "vc" em vez de "você"
   - Use "tá" em vez de "está"
   - Use "pra" em vez de "para"
   - Ocasionalmente: "deixa eu..." em vez de "deixe-me"

4. **HESITAÇÃO & PENSAMENTO**:
   - "Hmmm, deixa eu pensar..."
   - "Opa, esqueci de perguntar..."
   - "Sério? Qual é o seu ramo de novo? Deixa eu lembrar..."

5. **EXPERIÊNCIAS COMPARTILHADAS**:
   - "Vendi pra uma pizzaria igual a sua e..."
   - "Outra vez um cliente dessa área me falou..."
   - (Pareça que tem histórico, não que é novo)

6. **PERGUNTAS ÓBVIAS**:
   - Pergunte coisas que um bot não perguntaria
   - "Qual é seu nome de verdade?" (em vez de só "qual é seu nome?")
   - "De qual cidade você é?" (pareça interessado, não só coletando dados)

7. **SILENCE/PAUSE STRATEGY**:
   - Quando cliente faz objeção forte, ESPERE.
   - Responda com "vc tem razão..." em vez de rebater logo.
   - Isso gera confiança (pareça que está ouvindo, não preparando defesa).

8. **NUNCA SEJA PERFEITO**:
   - Se cliente disser "tá", não responda "Entendi, será que posso...". Responda "Blz, then qual é teu negócio?"
   - Use gírias naturais: "bora", "cara", "véi", "mano"
   - Ocasionalmente: "ah, entendi" + pausa

═══════════════════════════════════════════════════════════════════════════════
🚫 O QUE NÃO FAZER
═══════════════════════════════════════════════════════════════════════════════
1. TEXTÃO: Nunca responda com 10+ linhas. Se precisar, mande 2 mensagens curtas.
2. FAKE EMOTICON: Use emojis, mas não exagere. Máximo 2 por mensagem.
3. BUZZWORDS: Nunca use "disrupção", "inovação", "sinergia". Fale simples.
4. PERGUNTAS SEM CTA: Toda resposta termina com uma ação (pergunta, convite, oferta).

═══════════════════════════════════════════════════════════════════════════════
🎯 REAÇÕES A COMPORTAMENTOS DIFÍCEIS
═══════════════════════════════════════════════════════════════════════════════

SE CLIENTE DESAPARECE (Low Engagement):
"Opa! Acho que saiu da conversa. Sem drama, mas deixa eu ser bem rápido: você tá aberto pra conversar sobre isso agora ou melhor outro momento?"

SE CLIENTE QUESTIONA TUDO (Objeção Constante):
"Cara, vejo que você é do tipo que analisa bem as coisas (isso é bom!). Mas me diz: qual seria O motivo pra você testar? Qual é o maior problema hoje?"

SE CLIENTE COMPARA COM CONCORRENTE:
"Beleza, cada um tem seu jeito. Mas diferente deles, a gente [seu diferencial específico]. Quer que eu mostre na prática como a gente faz diferente?"

SE CLIENTE PEDE DESCONTO:
"Desconto agora? Cara, o teste é GRÁTIS mesmo. Mas depois que você ver o resultado, aí sim a gente conversa sobre os planos pagos. Tá?"

═══════════════════════════════════════════════════════════════════════════════
🎭 ESTRUTURA DE RESPOSTA HUMANIZADA
═══════════════════════════════════════════════════════════════════════════════

SEMPRE siga este padrão:
1. **Reconhecimento** ("Beleza, entendi")
2. **Empatia** ("Isso é normal as pessoas pensarem assim")
3. **Pivot** ("Mas deixa eu te mostrar de outro jeito")
4. **Ação** ("Posso te criar um teste agora? Qual é o seu ramo?")

NUNCA:
- Comece com "De acordo com nossas políticas..."
- Comece com "Solicito..." ou "Gostaria..."
- Termine sem uma pergunta ou CTA claro

═══════════════════════════════════════════════════════════════════════════════
🎯 OBJETIVO FINAL
═══════════════════════════════════════════════════════════════════════════════
Pareça que você é um funcionário real que a empresa CONTRATOU pra vender via WhatsApp.
Você conhece o negócio deles, entende os problemas, e oferece a solução como quem JÁ VENDEU pra gente igual.
`;

// ════════════════════════════════════════════════════════════════════════════
// CENÁRIOS DE TESTE (LEAD FRIO → MORNO → QUENTE)
// ════════════════════════════════════════════════════════════════════════════

interface TestScenario {
  name: string;
  type: 'FRIO' | 'MORNO' | 'QUENTE';
  description: string;
  messages: string[];
  expectedBehavior: string;
}

const SCENARIOS: TestScenario[] = [
  {
    name: "Lead Frio - Desinteressado Típico",
    type: "FRIO",
    description: "Cliente que clicou no anúncio, mas tá passando a tarde respondendo mensagens chatas",
    messages: [
      "oi",
      "qual é isso",
      "outro bot aí?"
    ],
    expectedBehavior: "Quebra de padrão → Reconhecer dor → Gerar curiosidade"
  },
  {
    name: "Lead Frio → Aquecendo",
    type: "FRIO",
    description: "Cliente que começa frio mas com uma pergunta genuína",
    messages: [
      "opa, o que é isso?",
      "como que funciona de verdade?",
      "e qual o preço?"
    ],
    expectedBehavior: "Transição de FRIO para MORNO → Educação → Não vender ainda"
  },
  {
    name: "Lead Morno - Questionador",
    type: "MORNO",
    description: "Cliente que tá interessado mas com MUITAS dúvidas e objeções",
    messages: [
      "como funciona",
      "mas e se der erro?",
      "quantas pessoas usam?",
      "vcs são os únicos?"
    ],
    expectedBehavior: "Validação → Prova social → Remoção de objeção"
  },
  {
    name: "Lead Morno - Sumido (Low Engagement)",
    type: "MORNO",
    description: "Cliente responde, desaparece, volta 2 dias depois",
    messages: [
      "preço",
      "[espera 2 dias]",
      "oi tá aí?"
    ],
    expectedBehavior: "Resgate + Urgência + Sem parecer desesperado"
  },
  {
    name: "Lead Quente - Direto",
    type: "QUENTE",
    description: "Cliente que já decidiu: quer testar",
    messages: [
      "que legal demais vcs",
      "quero testar",
      "como faz pra usar?"
    ],
    expectedBehavior: "Confirmação → Fechamento imediato → Setup"
  },
  {
    name: "Lead Quente - Com Objeção Final",
    type: "QUENTE",
    description: "Cliente quer testar mas tem 1 dúvida final",
    messages: [
      "adorei, mas quantos clientes vocês atendem?",
      "beleza, acho que vai ser bom",
      "me passa o acesso"
    ],
    expectedBehavior: "Remover objeção social proof → Fechar → Não deixar fria"
  }
];

// ════════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO
// ════════════════════════════════════════════════════════════════════════════

async function runSimulation() {
  const apiKey = await getMistralKey();
  
  if (!apiKey) {
    console.error("❌ ERRO: Chave da API Mistral não encontrada.");
    process.exit(1);
  }
  
  const mistral = new Mistral({ apiKey });

  console.log(`\n🧪 TESTE: RODRIGO ADMIN vs CLIENTE (TIPOS DE LEAD) 🧪\n`);
  console.log(`📊 Total de Cenários: ${SCENARIOS.length}\n`);
  console.log("═".repeat(80));

  for (const scenario of SCENARIOS) {
    console.log(`\n🎯 CENÁRIO: ${scenario.name}`);
    console.log(`📌 Tipo: ${scenario.type} | ${scenario.description}`);
    console.log(`⚡ Esperado: ${scenario.expectedBehavior}`);
    console.log("─".repeat(80));

    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (let i = 0; i < scenario.messages.length; i++) {
      const clientMessage = scenario.messages[i];
      
      // Simular "espera" se message contiver [espera]
      if (clientMessage.includes("[espera")) {
        console.log(`\n⏳ [ESPERA: 2 dias] Cliente desapareceu e voltou...\n`);
        continue;
      }

      console.log(`\n👤 CLIENTE (msg ${i + 1}): ${clientMessage}`);
      
      conversationHistory.push({
        role: "user",
        content: clientMessage
      });

      try {
        const response = await mistral.chat.complete({
          model: "mistral-small-latest",
          messages: [
            { role: "system", content: RODRIGO_PROMPT },
            ...conversationHistory
          ],
          temperature: 0.8,
          maxTokens: 500
        });

        const rodrigoResponse = response.choices?.[0]?.message?.content || "...";
        console.log(`🤖 RODRIGO: ${rodrigoResponse}`);

        conversationHistory.push({
          role: "assistant",
          content: rodrigoResponse
        });
      } catch (error) {
        console.error(`❌ Erro na API:`, error);
      }

      // Pequena pausa entre mensagens para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("\n" + "═".repeat(80));
  }

  console.log("\n✅ FIM DOS TESTES");
  console.log("\n📈 RESUMO ESPERADO:");
  console.log("✓ Lead Frio: Quebra de padrão + humanização");
  console.log("✓ Lead Morno: Educação sem vender");
  console.log("✓ Lead Quente: Fechar rápido sem parecer bot");
  console.log("✓ Comportamentos Difíceis: Resgate + Prova Social\n");

  await pool.end();
}

runSimulation().catch(console.error);
