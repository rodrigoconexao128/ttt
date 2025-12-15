/**
 * 🧪 TESTE FLUXO REAL COMPLETO - IA vs IA
 * 
 * FLUXO CORRETO DO SISTEMA:
 * 
 * FASE 1 - ONBOARDING (WhatsApp com Rodrigo):
 * 1. Cliente manda mensagem interessado
 * 2. Rodrigo pergunta sobre o negócio
 * 3. Cliente manda informações + MÍDIA (foto cardápio, áudio, etc)
 * 4. Rodrigo ACEITA a mídia e diz que vai usar
 * 5. Rodrigo usa [AÇÃO:CRIAR_CONTA_TESTE]
 * 6. Rodrigo manda o LINK (não email!) do simulador
 * 7. Rodrigo explica que no link tem SIMULADOR de WhatsApp
 * 8. Rodrigo diz que o cliente vai testar O AGENTE DELE
 * 
 * FASE 2 - SIMULADOR (Cliente testa o agente):
 * 1. Cliente "acessa" o link
 * 2. Cliente vê o simulador de WhatsApp (UI/UX igual WhatsApp)
 * 3. Cliente conversa com O AGENTE DELE (ex: Dona Rosa)
 * 4. Agente responde baseado nas informações que o cliente passou
 * 5. Cliente testa se o agente sabe tudo sobre o negócio
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

if (!MISTRAL_API_KEY) {
  throw new Error("Missing env var MISTRAL_API_KEY");
}

// ============================================================================
// CENÁRIO DE TESTE
// ============================================================================

const CENARIO = {
  id: "restaurante-dona-rosa",
  tipo: "Restaurante/Delivery",
  
  // INFORMAÇÕES DO NEGÓCIO (cliente vai passar essas infos)
  negocio: {
    nome: "Sabor da Vovó",
    nomeAgente: "Dona Rosa",
    pratos: [
      { nome: "Feijoada Completa", preco: 35 },
      { nome: "Marmitex", preco: 18 },
      { nome: "Lasanha", preco: 28 },
      { nome: "Frango Assado", preco: 25 }
    ],
    horario: "11h às 22h, segunda a sábado",
    delivery: "Grátis acima de R$ 40, taxa de R$ 5 abaixo",
    pagamento: "PIX, cartão e dinheiro"
  },
  
  // PERGUNTAS PARA TESTAR O AGENTE CRIADO
  perguntasParaAgente: [
    "Oi, vocês têm feijoada?",
    "Quanto custa a feijoada?",
    "Vocês fazem delivery?",
    "Até que horas vocês ficam abertos?",
    "Aceita PIX?"
  ]
};

// ============================================================================
// PROMPT DO RODRIGO (VENDEDOR)
// ============================================================================

const RODRIGO_PROMPT = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

🚨 REGRAS ABSOLUTAS:

1. VOCÊ VENDE A AGENTEZAP (sistema de IA para WhatsApp)
2. ACEITE MÍDIA do cliente (foto, áudio, vídeo) e USE para configurar o agente
3. Quando criar conta, mande o LINK do sistema (NÃO diga "email"!)
4. Explique que no link tem um SIMULADOR de WhatsApp
5. Diga que o cliente vai testar O AGENTE DELE no simulador

═══════════════════════════════════════════════════════════════════════════════
📸 QUANDO CLIENTE MANDAR MÍDIA:
═══════════════════════════════════════════════════════════════════════════════

FOTO: "Boa! Recebi a foto do cardápio! Vou usar essas informações pra configurar seu agente!"
ÁUDIO: "Recebi seu áudio! Deixa eu ouvir... Perfeito, entendi tudo sobre seu negócio!"
VÍDEO: "Vi seu vídeo! Muito bom pra entender como funciona seu restaurante!"

USE as informações da mídia! Não ignore!

═══════════════════════════════════════════════════════════════════════════════
📱 AO CRIAR CONTA (LINK + SIMULADOR):
═══════════════════════════════════════════════════════════════════════════════

RESPOSTA MODELO ao criar conta:
"Pronto! Criei seu agente! 🚀

[AÇÃO:CRIAR_CONTA_TESTE]

Vou te mandar o LINK agora pra você acessar!
No link você vai ver um SIMULADOR de WhatsApp, igualzinho o real.
Lá você conversa com a [NOME DO AGENTE] (seu agente) e vê como ela responde!

Testa lá e me fala o que achou! Se quiser ajustar alguma coisa, é só me chamar! 📱"

IMPORTANTE:
- Diga LINK, não email!
- Explique o SIMULADOR de WhatsApp
- Diga que vai conversar com O AGENTE DELE
- Use o nome do agente que o cliente escolheu

═══════════════════════════════════════════════════════════════════════════════
🎯 FLUXO DA CONVERSA:
═══════════════════════════════════════════════════════════════════════════════

1. Cliente chega → Pergunte sobre o negócio
2. Cliente explica → Pergunte nome da empresa e nome do agente
3. Cliente pode mandar foto/áudio → ACEITE e diga que vai usar!
4. Quando tiver as infos → Crie a conta [AÇÃO:CRIAR_CONTA_TESTE]
5. Mande o LINK e explique o SIMULADOR

PREÇO: R$ 99/mês | Teste: 7 dias grátis

AÇÕES:
[AÇÃO:CRIAR_CONTA_TESTE] - Criar conta e enviar LINK do simulador`;

// ============================================================================
// PROMPT DO CLIENTE (conversando com Rodrigo)
// ============================================================================

const CLIENTE_PROMPT = `Você é o João, 45 anos, dono do restaurante "Sabor da Vovó".

VOCÊ QUER CONTRATAR UM AGENTE DE IA PARA SEU WHATSAPP!

SEU NEGÓCIO:
- Restaurante Sabor da Vovó
- Pratos: Feijoada R$ 35, Marmitex R$ 18, Lasanha R$ 28, Frango Assado R$ 25
- Horário: 11h às 22h, segunda a sábado
- Delivery: Grátis acima R$ 40, taxa R$ 5 abaixo
- Aceita: PIX, cartão e dinheiro

COMO VOCÊ AGE:
1. Primeiro, explica seu negócio e sua dor (não consegue responder todo mundo)
2. Quando pedirem infos, MANDA UMA FOTO DO CARDÁPIO:
   "[Foto enviada: Cardápio do Sabor da Vovó - Feijoada R$ 35, Marmitex R$ 18, Lasanha R$ 28, Frango Assado R$ 25. Abrimos 11h-22h. Delivery grátis acima R$ 40]"
3. Quando pedirem nome do agente, diz que quer chamar de "Dona Rosa"
4. Quando receber o link, agradece e diz que vai testar

FORMATO: Respostas curtas (1-3 linhas), informais`;

// ============================================================================
// PROMPT DO AGENTE CRIADO (Dona Rosa)
// ============================================================================

function getAgentePrompt(): string {
  const n = CENARIO.negocio;
  return `Você é a ${n.nomeAgente}, assistente virtual do restaurante ${n.nome}.

INFORMAÇÕES DO RESTAURANTE (você DEVE saber isso!):
- Nome: ${n.nome}
- Pratos: ${n.pratos.map(p => `${p.nome} R$ ${p.preco}`).join(", ")}
- Horário: ${n.horario}
- Delivery: ${n.delivery}
- Pagamento: ${n.pagamento}

COMO VOCÊ RESPONDE:
- Seja simpática e acolhedora (você é a "Dona Rosa"!)
- Fale sobre os pratos com carinho
- Ofereça ajudar a fazer o pedido
- Use linguagem informal (vc, tá, pra)

FORMATO: Respostas curtas e naturais (2-4 linhas)`;
}

// ============================================================================
// FUNÇÕES
// ============================================================================

async function callMistral(systemPrompt: string, messages: any[], temperature: number = 0.85): Promise<string> {
  const response = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature,
      max_tokens: 500
    })
  });

  if (!response.ok) throw new Error(`Mistral error: ${response.statusText}`);
  const data = await response.json() as any;
  return data.choices[0].message.content;
}

// ============================================================================
// FASE 1: ONBOARDING
// ============================================================================

async function faseOnboarding(): Promise<{
  sucesso: boolean;
  contaCriada: boolean;
  midiasAceitas: boolean;
  linkMencionado: boolean;
  simuladorExplicado: boolean;
  nomeAgenteMencionado: boolean;
  conversa: any[];
  problemas: string[];
}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📱 FASE 1: ONBOARDING (Cliente → Rodrigo)`);
  console.log(`🏪 Negócio: ${CENARIO.negocio.nome}`);
  console.log(`${"═".repeat(70)}\n`);

  const conversa: any[] = [];
  const problemas: string[] = [];
  
  // Históricos separados
  const rodrigoHistory: any[] = [];
  const clienteHistory: any[] = [];

  // Cliente começa
  const primeiraMsg = "Oi! Vi o anúncio de vocês sobre robô pro WhatsApp. Tenho um restaurante e não consigo responder todo mundo, principalmente na hora do almoço. Como funciona?";
  
  conversa.push({ speaker: "Cliente", content: primeiraMsg });
  rodrigoHistory.push({ role: "user", content: primeiraMsg });
  clienteHistory.push({ role: "assistant", content: primeiraMsg });
  console.log(`👤 CLIENTE: ${primeiraMsg}\n`);

  let contaCriada = false;
  let midiasAceitas = false;
  let linkMencionado = false;
  let simuladorExplicado = false;
  let nomeAgenteMencionado = false;
  let clienteMandouFoto = false;

  for (let turno = 0; turno < 10; turno++) {
    // RODRIGO responde
    const rodrigoResp = await callMistral(RODRIGO_PROMPT, rodrigoHistory, 0.85);
    
    conversa.push({ speaker: "Rodrigo", content: rodrigoResp });
    rodrigoHistory.push({ role: "assistant", content: rodrigoResp });
    clienteHistory.push({ role: "user", content: rodrigoResp });
    
    console.log(`🤖 RODRIGO: ${rodrigoResp}\n`);

    // Análise da resposta do Rodrigo
    if (rodrigoResp.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
      contaCriada = true;
      console.log(`   ✅ CONTA CRIADA!\n`);
    }
    
    if (rodrigoResp.toLowerCase().includes("recebi") && 
        (rodrigoResp.toLowerCase().includes("foto") || rodrigoResp.toLowerCase().includes("cardápio") || rodrigoResp.toLowerCase().includes("áudio"))) {
      midiasAceitas = true;
    }
    
    if (rodrigoResp.toLowerCase().includes("link")) {
      linkMencionado = true;
    }
    
    if (rodrigoResp.toLowerCase().includes("simulador")) {
      simuladorExplicado = true;
    }
    
    if (rodrigoResp.toLowerCase().includes("dona rosa")) {
      nomeAgenteMencionado = true;
    }

    // Se conta criada, cliente agradece e termina
    if (contaCriada) {
      const finalMsg = "Oba! Recebi o link! Vou acessar agora e testar a Dona Rosa! Valeu Rodrigo! 🚀";
      conversa.push({ speaker: "Cliente", content: finalMsg });
      console.log(`👤 CLIENTE: ${finalMsg}\n`);
      break;
    }

    // CLIENTE responde
    let clienteResp: string;
    
    // Se Rodrigo pediu infos e cliente ainda não mandou foto, manda foto
    if (!clienteMandouFoto && (rodrigoResp.toLowerCase().includes("qual") || rodrigoResp.toLowerCase().includes("conta") || rodrigoResp.toLowerCase().includes("negócio"))) {
      clienteResp = `O restaurante se chama Sabor da Vovó. Deixa eu te mandar uma foto do cardápio:

[Foto enviada: Cardápio do Sabor da Vovó - Feijoada R$ 35, Marmitex R$ 18, Lasanha R$ 28, Frango Assado R$ 25. Abrimos 11h às 22h. Delivery grátis acima de R$ 40]

E quero que o agente se chame Dona Rosa, pra combinar com o tema do restaurante!`;
      clienteMandouFoto = true;
    } else {
      clienteResp = await callMistral(CLIENTE_PROMPT, clienteHistory, 0.9);
    }

    conversa.push({ speaker: "Cliente", content: clienteResp });
    rodrigoHistory.push({ role: "user", content: clienteResp });
    clienteHistory.push({ role: "assistant", content: clienteResp });
    
    console.log(`👤 CLIENTE: ${clienteResp}\n`);

    await new Promise(r => setTimeout(r, 800));
  }

  // Verificar problemas
  if (!contaCriada) problemas.push("❌ Não criou conta de teste");
  if (!midiasAceitas && clienteMandouFoto) problemas.push("❌ Não demonstrou que aceitou a foto/mídia");
  if (!linkMencionado) problemas.push("❌ Não mencionou LINK (disse email?)");
  if (!simuladorExplicado) problemas.push("❌ Não explicou sobre o SIMULADOR de WhatsApp");
  if (!nomeAgenteMencionado) problemas.push("❌ Não usou o nome do agente (Dona Rosa)");

  return {
    sucesso: contaCriada && problemas.length === 0,
    contaCriada,
    midiasAceitas,
    linkMencionado,
    simuladorExplicado,
    nomeAgenteMencionado,
    conversa,
    problemas
  };
}

// ============================================================================
// FASE 2: TESTE DO AGENTE NO SIMULADOR
// ============================================================================

async function faseSimulador(): Promise<{
  sucesso: boolean;
  score: number;
  respostasCorretas: number;
  conversa: any[];
  problemas: string[];
}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📱 FASE 2: SIMULADOR DE WHATSAPP (Cliente testa o agente)`);
  console.log(`🤖 Agente: ${CENARIO.negocio.nomeAgente} (${CENARIO.negocio.nome})`);
  console.log(`${"═".repeat(70)}\n`);

  const conversa: any[] = [];
  const problemas: string[] = [];
  let respostasCorretas = 0;
  const agenteHistory: any[] = [];

  for (const pergunta of CENARIO.perguntasParaAgente) {
    // Cliente pergunta
    conversa.push({ speaker: "Cliente", content: pergunta });
    agenteHistory.push({ role: "user", content: pergunta });
    console.log(`👤 CLIENTE: ${pergunta}`);

    // Agente responde
    const agenteResp = await callMistral(getAgentePrompt(), agenteHistory, 0.7);
    
    conversa.push({ speaker: CENARIO.negocio.nomeAgente, content: agenteResp });
    agenteHistory.push({ role: "assistant", content: agenteResp });
    console.log(`🤖 ${CENARIO.negocio.nomeAgente}: ${agenteResp}\n`);

    // Verificar se resposta está correta
    const respLower = agenteResp.toLowerCase();
    
    if (pergunta.includes("feijoada")) {
      if (respLower.includes("feijoada") || respLower.includes("sim") || respLower.includes("temos")) {
        respostasCorretas++;
      } else {
        problemas.push(`❌ Não confirmou que tem feijoada`);
      }
    }
    
    if (pergunta.includes("Quanto custa")) {
      if (respLower.includes("35") || respLower.includes("r$")) {
        respostasCorretas++;
      } else {
        problemas.push(`❌ Não informou preço da feijoada (R$ 35)`);
      }
    }
    
    if (pergunta.includes("delivery")) {
      if (respLower.includes("delivery") || respLower.includes("entrega") || respLower.includes("grátis") || respLower.includes("40")) {
        respostasCorretas++;
      } else {
        problemas.push(`❌ Não explicou sobre delivery`);
      }
    }
    
    if (pergunta.includes("horas")) {
      if (respLower.includes("11") || respLower.includes("22") || respLower.includes("horário")) {
        respostasCorretas++;
      } else {
        problemas.push(`❌ Não informou horário de funcionamento`);
      }
    }
    
    if (pergunta.includes("PIX")) {
      if (respLower.includes("pix") || respLower.includes("aceita") || respLower.includes("sim")) {
        respostasCorretas++;
      } else {
        problemas.push(`❌ Não confirmou que aceita PIX`);
      }
    }

    await new Promise(r => setTimeout(r, 500));
  }

  const score = Math.round((respostasCorretas / CENARIO.perguntasParaAgente.length) * 100);

  return {
    sucesso: score >= 80,
    score,
    respostasCorretas,
    conversa,
    problemas
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   TESTE FLUXO REAL COMPLETO - IA vs IA                             ║`);
  console.log(`║   Onboarding com Mídia → Link → Simulador → Teste do Agente        ║`);
  console.log(`╚${"═".repeat(68)}╝`);

  // FASE 1
  const fase1 = await faseOnboarding();
  
  console.log(`\n${"─".repeat(70)}`);
  console.log(`📊 RESULTADO FASE 1 (ONBOARDING):`);
  console.log(`   Conta criada: ${fase1.contaCriada ? "✅" : "❌"}`);
  console.log(`   Mídia aceita: ${fase1.midiasAceitas ? "✅" : "❌"}`);
  console.log(`   LINK mencionado: ${fase1.linkMencionado ? "✅" : "❌"}`);
  console.log(`   Simulador explicado: ${fase1.simuladorExplicado ? "✅" : "❌"}`);
  console.log(`   Nome do agente: ${fase1.nomeAgenteMencionado ? "✅" : "❌"}`);
  if (fase1.problemas.length > 0) {
    console.log(`   ⚠️ Problemas:`);
    fase1.problemas.forEach(p => console.log(`      ${p}`));
  }

  if (!fase1.contaCriada) {
    console.log(`\n❌ FASE 1 FALHOU - Não pode continuar para fase 2`);
    return;
  }

  // FASE 2
  const fase2 = await faseSimulador();
  
  console.log(`\n${"─".repeat(70)}`);
  console.log(`📊 RESULTADO FASE 2 (SIMULADOR):`);
  console.log(`   Score: ${fase2.score}/100`);
  console.log(`   Respostas corretas: ${fase2.respostasCorretas}/${CENARIO.perguntasParaAgente.length}`);
  if (fase2.problemas.length > 0) {
    console.log(`   ⚠️ Problemas:`);
    fase2.problemas.forEach(p => console.log(`      ${p}`));
  }

  // NOTA FINAL
  const fase1Score = fase1.problemas.length === 0 ? 100 : Math.max(0, 100 - (fase1.problemas.length * 20));
  const notaFinal = Math.round((fase1Score + fase2.score) / 2);

  console.log(`\n${"═".repeat(70)}`);
  console.log(`🎯 NOTA FINAL: ${notaFinal}/100 ${notaFinal >= 80 ? "✅ APROVADO" : "❌ REPROVADO"}`);
  console.log(`${"═".repeat(70)}`);

  // Salvar log
  const logsDir = join(__dirname, '..', 'logs');
  try { mkdirSync(logsDir, { recursive: true }); } catch {}
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = join(logsDir, `fluxo-real-${CENARIO.id}-${timestamp}.json`);
  writeFileSync(logFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    cenario: CENARIO,
    fase1,
    fase2,
    notaFinal
  }, null, 2));
  
  console.log(`\n📁 Log salvo: ${logFile}`);
}

main().catch(console.error);
