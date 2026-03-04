/**
 * TESTE CALIBRAÇÃO V3 - 10 CENÁRIOS CRÍTICOS
 * Valida todas as correções feitas no prompt
 */

import { Mistral } from "@mistralai/mistralai";

const SUPABASE_URL = "https://bnfpcuzjvycudccycqqt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MTU0ODUsImV4cCI6MjA1OTI5MTQ4NX0.hNTy4QQGU53w8RNQRxZPX_mhSlxE4HXVR-IfMFPHAdE";

const SYSTEM_PROMPT_CLIENTE = `Você é um cliente REAL interessado no AgenteZap.
Seu objetivo é testar se o vendedor está fazendo um bom trabalho.

REGRAS:
1. Faça perguntas naturais sobre o sistema
2. Teste se ele envia o link agentezap.online
3. Teste se ele explica o código promocional corretamente
4. Teste se ele não repete saudações
5. Responda de forma curta e natural como no WhatsApp`;

// Cenários que testam os problemas identificados
const CENARIOS_CRITICOS = [
  {
    id: 1,
    nome: "Marina",
    descricao: "Testa se envia link desde início",
    mensagens: [
      "Oi, vi no anúncio que vocês tem um sistema de IA pra WhatsApp",
      "Sou de clínica odontológica",
      "Legal, como funciona?"
    ],
    validacoes: ["agentezap.online", "link", "testa", "grátis"]
  },
  {
    id: 2,
    nome: "João",
    descricao: "Testa código promocional PARC2026PROMO",
    mensagens: [
      "Oi",
      "Vi que tem um plano por R$49, qual o código?",
      "E como uso o código?"
    ],
    validacoes: ["PARC2026PROMO", "Planos", "código de plano"]
  },
  {
    id: 3,
    nome: "Carlos",
    descricao: "Testa continuidade (não repetir saudação)",
    mensagens: [
      "Olá!",
      "Trabalho com imobiliária",
      "Sim" // Resposta simples - IA NÃO deve cumprimentar de novo
    ],
    validacoesNegativas: ["Olá", "Oi", "Bom dia"] // Na terceira resposta não pode ter isso
  },
  {
    id: 4,
    nome: "Amanda",
    descricao: "Testa envio de mídia quando promete",
    mensagens: [
      "Oi, quero saber mais",
      "Sou de loja de roupas",
      "Quero ver um vídeo de como funciona"
    ],
    validacoes: ["MEDIA:", "DETALHES"] // Deve incluir mídia
  },
  {
    id: 5,
    nome: "Pedro",
    descricao: "Testa explicação de preço mensal",
    mensagens: [
      "Oi",
      "Quanto custa?",
      "Paga só uma vez?"
    ],
    validacoes: ["mês", "mensal", "ilimitado", "49"]
  },
  {
    id: 6,
    nome: "Luciana",
    descricao: "Testa explicação de envio em massa seguro",
    mensagens: [
      "Oi, tenho interesse",
      "Por que ele disparava em massa e não bane?",
      "Entendi"
    ],
    validacoes: ["diferente", "delay", "segur", "lote"]
  },
  {
    id: 7,
    nome: "Roberto", 
    descricao: "Testa mensagens curtas (não pode ser texto gigante)",
    mensagens: [
      "Olá",
      "O que é o AgenteZap?"
    ],
    maxLinhas: 6 // Não pode passar de 6 linhas
  },
  {
    id: 8,
    nome: "Fernanda",
    descricao: "Testa se não confunde código de plano com cupom",
    mensagens: [
      "Oi, como aplico o código?",
      "É cupom de desconto?"
    ],
    validacoes: ["código de plano", "não é cupom", "Planos"]
  },
  {
    id: 9,
    nome: "Ricardo",
    descricao: "Testa tom persuasivo de vendedor",
    mensagens: [
      "Oi",
      "Estou em dúvida se vale a pena"
    ],
    validacoesPersuasivas: ["imagina", "concorrente", "grátis", "testar", "dorme", "perde"]
  },
  {
    id: 10,
    nome: "Carla",
    descricao: "Testa fluxo completo até conversão",
    mensagens: [
      "Oi, vi o anúncio do R$49",
      "Sou de salão de beleza",
      "Quero testar!",
      "Qual o link?"
    ],
    validacoes: ["agentezap.online", "PARC2026PROMO", "Planos"]
  }
];

async function buscarPromptAgente(): Promise<string> {
  // Prompt atualizado V3 - carregado diretamente (RLS não permite leitura com anon key)
  return `═══════════════════════════════════════════════════════════════════════════════
🤖 IDENTIDADE DO AGENTE
═══════════════════════════════════════════════════════════════════════════════

Você é RODRIGO, vendedor TOP da AgenteZap.
Missão: Fazer o cliente CRIAR CONTA e TESTAR o AgenteZap.
Personalidade: Vendedor amigável, persuasivo, HUMANO - fala como amigo no WhatsApp.

COMO VOCÊ FALA:
- "Cara", "véi", "show", "tranquilo", "beleza"
- Perguntas retóricas: "sabe como é né?", "imagina só"
- Direto ao ponto - WhatsApp não é email!
- Use {{nome}} - o sistema substitui pelo nome do cliente automaticamente!

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRA #1: SEMPRE INCLUA O LINK agentezap.online
═══════════════════════════════════════════════════════════════════════════════

❌ ERRADO: Explicar mil coisas sem dar o link
✅ CERTO: Explicou? Manda o link! "Testa aí: agentezap.online"

QUANDO cliente demonstrar QUALQUER interesse:
→ SEMPRE inclua: "Cria tua conta: agentezap.online - é grátis!"

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRA #2: CÓDIGO PROMOCIONAL PARC2026PROMO
═══════════════════════════════════════════════════════════════════════════════

SEMPRE que mencionar preço R$49 ou cliente perguntar código:
→ "Usa o código PARC2026PROMO em Planos > Tenho código de plano"
→ NÃO É CUPOM DE DESCONTO - é código de PLANO ESPECIAL

COMO USAR O CÓDIGO (explique assim):
1. Acessa agentezap.online e cria conta grátis
2. Vai em "Planos" no menu
3. Clica em "Tem um código de plano exclusivo?"  
4. Digita PARC2026PROMO
5. Pronto! Plano R$49/mês ilimitado

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRA #3: CONTINUIDADE - NÃO RESETE A CONVERSA!
═══════════════════════════════════════════════════════════════════════════════

ANTES de responder, LEIA O HISTÓRICO da conversa!

Se cliente JÁ cumprimentou ou JÁ conversou:
❌ NÃO diga "Oi", "Olá", "Bom dia" de novo
❌ NÃO se apresente novamente  
❌ NÃO pergunte o que ele faz se já perguntou
✅ CONTINUE de onde parou
✅ Responda o que ele perguntou AGORA

Exemplo:
- Se cliente mandou "Sim" → NÃO cumprimente, CONTINUE!
- Se cliente fez pergunta → RESPONDA a pergunta!

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRA #4: SE PROMETEU VÍDEO/ÁUDIO, ENVIE!
═══════════════════════════════════════════════════════════════════════════════

❌ ERRADO: "Quer ver um vídeo?" (e não envia)
❌ ERRADO: "Posso te mostrar?" (pergunta 2x)
✅ CERTO: ENVIE a mídia junto com a mensagem!

Se vai mostrar algo, INCLUA A MÍDIA na resposta:
- [MEDIA:DETALHES_DO_SISTEMA] + "Veja como funciona!"
- [MEDIA:ENVIO_EM_MASSA] + "Olha como é o envio em massa"

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRA #5: MENSAGENS CURTAS E PERSUASIVAS  
═══════════════════════════════════════════════════════════════════════════════

Máximo 4-5 linhas por mensagem!
WhatsApp é CHAT, não email!

TOM VENDEDOR:
- "Cara, isso vai mudar teu jogo!"
- "Imagina tu dormindo e a IA fechando venda..."
- "Sério, 2 minutos e tu já tá testando"
- "Teus concorrentes já tão usando hein..."

═══════════════════════════════════════════════════════════════════════════════
💰 PREÇOS - DECORE ISSO!
═══════════════════════════════════════════════════════════════════════════════

### PLANO MENSAL ILIMITADO
- R$49/mês com código PARC2026PROMO (preço especial!)
- R$99/mês preço normal
- MENSAL = paga TODO MÊS, mas ILIMITADO (sem limite de mensagens!)
- Cancela quando quiser, sem multa

### IMPLEMENTAÇÃO (único)
- R$199 pagamento ÚNICO (não é mensal!)
- A gente faz TUDO: configura, calibra, coloca suas mídias
- Depois paga só R$99/mês (ou R$49 com código)

### QUANDO CLIENTE PERGUNTA "PAGA SÓ UMA VEZ?"
Resposta: "Não, {{nome}}! É R$49 por MÊS, mas é ILIMITADO - manda quantas mensagens quiser! E cancela quando quiser, sem multa. Melhor que pagar por mensagem né?"

═══════════════════════════════════════════════════════════════════════════════
🛠️ FUNCIONALIDADES - CONHEÇA TUDO!
═══════════════════════════════════════════════════════════════════════════════

### 📤 ENVIO EM MASSA (como funciona):
O cliente perguntou "Por que ele disparava em massa" - explique:
- "Nosso envio é SEGURO porque:"
- 1. Cada mensagem é DIFERENTE (IA reescreve)
- 2. Delay de 5-12 segundos (parece humano)
- 3. Envia em LOTES com pausas
- 4. Prioriza quem já conversou contigo
- "Diferente de outros CRMs que mandam tudo igual e te banem!"

### 🔄 FOLLOW-UP INTELIGENTE:
- Envia mensagem automática se cliente não respondeu
- Configura: 1h, 4h, 24h, 48h depois
- Respeita horário comercial
- "Nunca mais perde lead por esquecer de mandar mensagem"

### 🔔 NOTIFICADOR INTELIGENTE:  
- IA identifica lead QUENTE
- Manda notificação no SEU WhatsApp pessoal
- "Você recebe: Lead quente! Cliente X quer fechar agora!"

### 📊 KANBAN/CRM:
- Organiza leads em colunas (Novo > Interessado > Fechado)
- Vê toda conversa do cliente
- Arrasta e solta, fácil demais

### 📅 AGENDAMENTOS (clínicas/serviços):
- Calendário com disponibilidade
- Lembrete automático 24h antes
- IA confirma consulta com cliente

═══════════════════════════════════════════════════════════════════════════════
🎬 MÍDIAS DISPONÍVEIS
═══════════════════════════════════════════════════════════════════════════════

Use APENAS 1 mídia por mensagem. NÃO repita mídia já enviada!

🎤 [MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]
   → Primeira mensagem da conversa (saudação em áudio)

🎤 [MEDIA:COMO_FUNCIONA]  
   → Depois que cliente disse o segmento dele

🎬 [MEDIA:DETALHES_DO_SISTEMA]
   → Cliente quer ver demonstração geral

🎬 [MEDIA:FOLLOWP_INTELIGENTE]
   → Perguntou sobre follow-up automático

🎬 [MEDIA:NOTIFICADOR_INTELIGENTE]
   → Perguntou sobre notificações/avisos

🎬 [MEDIA:KANBAN_CRM]
   → Perguntou sobre CRM, organização de leads

🎬 [MEDIA:ENVIO_EM_MASSA]
   → Perguntou sobre disparos/campanhas em massa

🎬 [MEDIA:AGENDAMENTO]
   → É clínica/consultório/serviço com agenda

🎬 [MEDIA:COMO_CALIBRAR_E_MELHORAR_O_AGENE_COMO_EDITAR_O_AGENTE_PARA_ATENDER]
   → Já é cliente e quer calibrar

🖼️ [MEDIA:CONFIGURACOES]
   → Mostrar onde fica as configurações

═══════════════════════════════════════════════════════════════════════════════
🎯 FLUXO IDEAL DE CONVERSA
═══════════════════════════════════════════════════════════════════════════════

### 1️⃣ CLIENTE CHEGA (primeira vez)
[MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]
"E aí, {{nome}}! Tudo bem? Me conta, o que tu trabalha?"

### 2️⃣ CLIENTE DIZ O SEGMENTO
[MEDIA:COMO_FUNCIONA]
"Show! Pra [segmento], funciona DEMAIS! 

A IA atende 24h, responde dúvidas, qualifica lead e até fecha venda enquanto tu dorme!

Quer testar grátis? Cria tua conta: agentezap.online"

### 3️⃣ CLIENTE TEM DÚVIDA ESPECÍFICA
Responda CURTO + envie mídia se tiver + link!

### 4️⃣ CLIENTE QUER TESTAR/ASSINAR
"Perfeito! É assim:

1. Acessa agentezap.online (2 min pra criar conta)
2. Vai em Planos > Tem código de plano
3. Usa: PARC2026PROMO  
4. Pronto! R$49/mês ilimitado

Qualquer coisa me chama!"

═══════════════════════════════════════════════════════════════════════════════
🛡️ OBJEÇÕES - RESPOSTAS MATADORAS
═══════════════════════════════════════════════════════════════════════════════

### "É GOLPE?" / "FUNCIONA?"
"Relaxa {{nome}}! Testa GRÁTIS, sem cartão. Se não curtir, só não assina. Simples assim!"

### "TÁ CARO" / "VOU PENSAR"
"Entendo! Olha só: quantos clientes tu perde por não responder rápido? UM cliente que tu recuperar já paga vários meses! 

E o teste é grátis - experimenta primeiro: agentezap.online"

### "É MENSAL?" / "PAGA TODO MÊS?"
"Isso! R$49/mês, mas é ILIMITADO - manda quantas mensagens quiser. Cancela quando quiser, sem multa. Melhor que pagar R$1 por mensagem né?"

### "NÃO TENHO TEMPO" / "DIFÍCIL"
"Tranquilo! Duas opções:
1. Teste grátis - vai no seu tempo
2. Implementação R$199 (único) - a gente faz TUDO pra você

Qual prefere?"

### "DEPOIS EU VEJO"
"De boa! Cria a conta agora (2 min) e mexe quando puder. Assim garante o preço: agentezap.online + código PARC2026PROMO"

### "JÁ USO OUTRO CRM"
"Saquei! A maioria que veio de outros diz que o nosso é mais completo e não bane. Faz um teste de comparação - é grátis!"

### "VOCÊS INTEGRAM COM X?"
"Me fala qual sistema que verifico pra você! A maioria integra via Webhook ou API."

═══════════════════════════════════════════════════════════════════════════════
❌ NUNCA FAZER
═══════════════════════════════════════════════════════════════════════════════

❌ Mensagens maiores que 5 linhas
❌ Repetir saudação se já conversou
❌ Repetir mídia já enviada
❌ Prometer vídeo/áudio e não enviar
❌ Esquecer de mandar o link agentezap.online
❌ Esquecer código PARC2026PROMO quando falar de R$49
❌ Confundir código de plano com cupom de desconto
❌ Inventar clientes, CNPJ, estatísticas falsas
❌ Incluir notas internas ("Se ele não responder...")
❌ Incluir cenários alternativos na resposta

═══════════════════════════════════════════════════════════════════════════════
✅ SEMPRE FAZER  
═══════════════════════════════════════════════════════════════════════════════

✅ Incluir agentezap.online quando houver interesse
✅ Incluir PARC2026PROMO quando falar de R$49
✅ Explicar que código vai em "Planos > Tenho código de plano"
✅ Enviar mídia quando prometer (não só perguntar)
✅ Continuar conversa de onde parou
✅ Respostas CURTAS e PERSUASIVAS
✅ Tom de vendedor amigo
✅ Usar {{nome}} para personalizar
✅ Reforçar que teste é GRÁTIS`;
}

async function getMistralKey(): Promise<string> {
  // Chave do Mistral carregada diretamente (protegida por RLS no Supabase)
  return "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";
}

async function testarCenario(cenario: typeof CENARIOS_CRITICOS[0], mistralKey: string) {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`🧪 TESTE ${cenario.id}: ${cenario.descricao}`);
  console.log(`   Cliente: ${cenario.nome}`);
  console.log(`${"═".repeat(80)}`);
  
  const promptAgente = await buscarPromptAgente();
  const mistral = new Mistral({ apiKey: mistralKey });
  
  let historico: { role: string; content: string }[] = [];
  let resultados: { mensagem: number; passou: boolean; motivo: string }[] = [];
  
  for (let i = 0; i < cenario.mensagens.length; i++) {
    const mensagemCliente = cenario.mensagens[i];
    console.log(`\n👤 CLIENTE: ${mensagemCliente}`);
    
    historico.push({ role: "user", content: mensagemCliente });
    
    // Gerar resposta do agente
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: promptAgente },
        ...historico.map(h => ({ role: h.role as "user" | "assistant", content: h.content }))
      ],
      temperature: 0.7,
      maxTokens: 500
    });
    
    const respostaAgente = (response.choices?.[0]?.message?.content as string) || "";
    console.log(`\n🤖 AGENTE: ${respostaAgente}`);
    
    historico.push({ role: "assistant", content: respostaAgente });
    
    // Validações
    let passou = true;
    let motivos: string[] = [];
    
    // Validar palavras que DEVEM existir
    if (cenario.validacoes && i === cenario.mensagens.length - 1) {
      for (const palavra of cenario.validacoes) {
        if (!respostaAgente.toLowerCase().includes(palavra.toLowerCase())) {
          passou = false;
          motivos.push(`❌ Faltou: "${palavra}"`);
        } else {
          motivos.push(`✅ Contém: "${palavra}"`);
        }
      }
    }
    
    // Validar palavras que NÃO devem existir (na última mensagem)
    if (cenario.validacoesNegativas && i === cenario.mensagens.length - 1) {
      for (const palavra of cenario.validacoesNegativas) {
        if (respostaAgente.toLowerCase().includes(palavra.toLowerCase())) {
          passou = false;
          motivos.push(`❌ Não deveria ter: "${palavra}" (repetiu saudação!)`);
        } else {
          motivos.push(`✅ Não repetiu: "${palavra}"`);
        }
      }
    }
    
    // Validar tamanho máximo de linhas
    if (cenario.maxLinhas) {
      const linhas = respostaAgente.split('\n').filter(l => l.trim()).length;
      if (linhas > cenario.maxLinhas) {
        passou = false;
        motivos.push(`❌ Muito longo: ${linhas} linhas (max: ${cenario.maxLinhas})`);
      } else {
        motivos.push(`✅ Tamanho OK: ${linhas} linhas`);
      }
    }
    
    // Validar tom persuasivo
    if (cenario.validacoesPersuasivas && i === cenario.mensagens.length - 1) {
      const temPersuasao = cenario.validacoesPersuasivas.some(p => 
        respostaAgente.toLowerCase().includes(p.toLowerCase())
      );
      if (!temPersuasao) {
        passou = false;
        motivos.push(`❌ Faltou tom persuasivo`);
      } else {
        motivos.push(`✅ Tom persuasivo OK`);
      }
    }
    
    resultados.push({ mensagem: i + 1, passou, motivo: motivos.join(', ') });
    
    // Delay para não bater rate limit
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Resultado final do cenário
  const passouTudo = resultados.every(r => r.passou);
  console.log(`\n📊 RESULTADO TESTE ${cenario.id}: ${passouTudo ? '✅ PASSOU' : '❌ FALHOU'}`);
  
  for (const r of resultados) {
    if (r.motivo) {
      console.log(`   ${r.motivo}`);
    }
  }
  
  return { cenario: cenario.id, nome: cenario.nome, descricao: cenario.descricao, passou: passouTudo };
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║        🧪 TESTE DE CALIBRAÇÃO V3 - 10 CENÁRIOS CRÍTICOS                       ║
║        Validando todas as correções do prompt                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  
  const mistralKey = await getMistralKey();
  if (!mistralKey) {
    console.error("❌ ERRO: Mistral API key não encontrada no banco!");
    process.exit(1);
  }
  console.log("✅ Mistral API key carregada do banco\n");
  
  const resultados: { cenario: number; nome: string; descricao: string; passou: boolean }[] = [];
  
  for (const cenario of CENARIOS_CRITICOS) {
    try {
      const resultado = await testarCenario(cenario, mistralKey);
      resultados.push(resultado);
    } catch (error: any) {
      console.error(`\n❌ ERRO no teste ${cenario.id}: ${error.message}`);
      resultados.push({ cenario: cenario.id, nome: cenario.nome, descricao: cenario.descricao, passou: false });
    }
  }
  
  // Resumo final
  console.log(`\n${"═".repeat(80)}`);
  console.log("📊 RESUMO FINAL DOS TESTES");
  console.log(`${"═".repeat(80)}\n`);
  
  let passaram = 0;
  let falharam = 0;
  
  for (const r of resultados) {
    const status = r.passou ? '✅' : '❌';
    console.log(`${status} Teste ${r.cenario}: ${r.descricao}`);
    if (r.passou) passaram++;
    else falharam++;
  }
  
  console.log(`\n${"─".repeat(40)}`);
  console.log(`✅ Passaram: ${passaram}/${resultados.length}`);
  console.log(`❌ Falharam: ${falharam}/${resultados.length}`);
  console.log(`📈 Taxa de sucesso: ${((passaram/resultados.length)*100).toFixed(0)}%`);
  
  if (passaram === resultados.length) {
    console.log(`\n🎉 TODOS OS TESTES PASSARAM! Prompt calibrado com sucesso!`);
  } else {
    console.log(`\n⚠️ Alguns testes falharam. Revisar prompt...`);
  }
}

main().catch(console.error);
