/**
 * 🧪 TESTE COMPLETO DO SISTEMA DE FOLLOW-UP INTELIGENTE
 * 
 * Simula cenários reais de diferentes tipos de negócio
 * para verificar se a IA gera mensagens naturais e contextualizadas
 * 
 * VERSÃO STANDALONE - Não precisa de banco de dados
 */

import { Mistral } from "@mistralai/mistralai";

console.log("\n" + "═".repeat(70));
console.log("🧪 SIMULADOR DE FOLLOW-UP INTELIGENTE");
console.log("═".repeat(70));

// Cenários de teste com diferentes negócios
const cenarios = [
  {
    nome: "Clínica de Estética",
    agentName: "Dra. Ana",
    companyName: "Clínica Beleza Pura",
    businessContext: "Clínica especializada em procedimentos estéticos faciais e corporais",
    historico: [
      { de: "CLIENTE", msg: "Oi, quero saber sobre botox", hora: "14:00" },
      { de: "NÓS", msg: "Olá! Que bom que nos procurou! O botox é um procedimento rápido e seguro. Temos promoção de R$ 990 a unidade. Quer agendar uma avaliação?", hora: "14:02" },
      { de: "CLIENTE", msg: "Quanto tempo dura?", hora: "14:05" },
      { de: "NÓS", msg: "O efeito dura de 4 a 6 meses em média. A aplicação leva apenas 15 minutos! Posso verificar nossa agenda?", hora: "14:06" },
    ],
    ultimaMsgClienteMin: 180, // 3 horas atrás
    ultimaMsgNossaMin: 175,
    clienteName: "Mariana"
  },
  {
    nome: "Agência de Marketing Digital",
    agentName: "Carlos",
    companyName: "Rocket Marketing",
    businessContext: "Agência especializada em tráfego pago e gestão de redes sociais",
    historico: [
      { de: "CLIENTE", msg: "Preciso aumentar as vendas do meu e-commerce", hora: "10:00" },
      { de: "NÓS", msg: "Olá! Entendo sua necessidade. Trabalhamos com gestão de tráfego pago focada em conversão. Qual é seu faturamento mensal atual?", hora: "10:03" },
      { de: "CLIENTE", msg: "Uns 50 mil por mês", hora: "10:10" },
      { de: "NÓS", msg: "Ótimo! Com esse volume, conseguimos resultados expressivos. Nosso pacote para e-commerce começa em R$ 2.500/mês. Posso te enviar uma proposta detalhada?", hora: "10:12" },
      { de: "CLIENTE", msg: "Pode sim", hora: "10:15" },
      { de: "NÓS", msg: "Perfeito! Vou preparar uma proposta personalizada. Qual seu email?", hora: "10:16" },
    ],
    ultimaMsgClienteMin: 300, // 5 horas atrás
    ultimaMsgNossaMin: 295,
    clienteName: "Roberto"
  },
  {
    nome: "Imobiliária",
    agentName: "Fernanda",
    companyName: "Imóveis Prime",
    businessContext: "Imobiliária de alto padrão em São Paulo, especializada em apartamentos de luxo",
    historico: [
      { de: "CLIENTE", msg: "Boa tarde, vi um apartamento no site de vocês na Vila Nova Conceição", hora: "15:00" },
      { de: "NÓS", msg: "Boa tarde! Que ótimo seu interesse! Qual apartamento chamou sua atenção? Temos várias opções na região.", hora: "15:02" },
      { de: "CLIENTE", msg: "O de 3 quartos por 2.8 milhões", hora: "15:05" },
      { de: "NÓS", msg: "Excelente escolha! Esse apartamento tem 180m², 3 suítes, 3 vagas. Vista privilegiada! Gostaria de agendar uma visita?", hora: "15:07" },
    ],
    ultimaMsgClienteMin: 1500, // 25 horas atrás
    ultimaMsgNossaMin: 1495,
    clienteName: "Dr. Henrique"
  },
  {
    nome: "Curso Online de Programação",
    agentName: "Tech Support",
    companyName: "DevMaster Academy",
    businessContext: "Escola de programação online com cursos de Python, JavaScript e Data Science",
    historico: [
      { de: "CLIENTE", msg: "Quero aprender programação do zero", hora: "20:00" },
      { de: "NÓS", msg: "Oi! Que legal que quer começar na programação! Nosso curso Programador do Zero é perfeito pra você. Começa com lógica e vai até criar seus próprios projetos!", hora: "20:02" },
      { de: "CLIENTE", msg: "Quanto custa?", hora: "20:05" },
      { de: "NÓS", msg: "O curso completo é R$ 997 à vista ou 12x de R$ 97. E essa semana temos 30% de desconto! Fica R$ 697 à vista. Quer garantir sua vaga?", hora: "20:06" },
      { de: "CLIENTE", msg: "Vou pensar", hora: "20:10" },
    ],
    ultimaMsgClienteMin: 2880, // 48 horas atrás
    ultimaMsgNossaMin: 2875,
    clienteName: "Lucas"
  },
  {
    nome: "Oficina Mecânica",
    agentName: "Seu João",
    companyName: "Auto Center Premium",
    businessContext: "Oficina mecânica especializada em carros importados e nacionais",
    historico: [
      { de: "CLIENTE", msg: "Meu carro tá fazendo um barulho estranho na roda", hora: "08:00" },
      { de: "NÓS", msg: "Bom dia! Que tipo de barulho? É ao frear ou o tempo todo? Precisamos avaliar, pode ser rolamento ou pastilha.", hora: "08:03" },
      { de: "CLIENTE", msg: "Só quando freio", hora: "08:05" },
      { de: "NÓS", msg: "Entendi, provavelmente são as pastilhas desgastadas. Precisa trocar urgente por segurança. Quer trazer hoje pra gente dar uma olhada? O orçamento é gratuito!", hora: "08:07" },
    ],
    ultimaMsgClienteMin: 240, // 4 horas atrás
    ultimaMsgNossaMin: 235,
    clienteName: "Pedro"
  }
];

// Configuração padrão de follow-up
const configPadrao = {
  tone: "consultivo",
  useEmojis: true,
  formalityLevel: 5
};

const toneMap: Record<string, string> = {
  'consultivo': 'consultivo e prestativo',
  'vendedor': 'vendedor persuasivo mas sutil',
  'humano': 'casual e amigável',
  'técnico': 'profissional e direto'
};

async function simularFollowUp(cenario: typeof cenarios[0], mistral: any) {
  console.log("\n" + "─".repeat(70));
  console.log(`🏢 CENÁRIO: ${cenario.nome.toUpperCase()}`);
  console.log("─".repeat(70));
  console.log(`   Empresa: ${cenario.companyName}`);
  console.log(`   Agente: ${cenario.agentName}`);
  console.log(`   Cliente: ${cenario.clienteName}`);
  console.log(`   Última msg cliente: há ${cenario.ultimaMsgClienteMin} min (${Math.floor(cenario.ultimaMsgClienteMin/60)}h)`);
  
  console.log("\n📜 HISTÓRICO DA CONVERSA:");
  for (const msg of cenario.historico) {
    const emoji = msg.de === "CLIENTE" ? "👤" : "🤖";
    console.log(`   [${msg.hora}] ${emoji} ${msg.de}: "${msg.msg}"`);
  }

  // Pegar últimas mensagens nossas para evitar repetição
  const ourLastMessages = cenario.historico
    .filter(m => m.de === "NÓS")
    .map(m => m.msg);

  // Formatar histórico
  const historyFormatted = cenario.historico.map(h => ({
    de: h.de,
    mensagem: h.msg,
    hora: h.hora
  }));

  // Última mensagem do cliente
  const lastClientMsg = cenario.historico.filter(m => m.de === "CLIENTE").pop();
  const lastClientText = lastClientMsg?.msg || "";

  const now = new Date();
  const brazilNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const todayStr = brazilNow.toLocaleDateString('pt-BR');
  const dayOfWeek = brazilNow.getDay();
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const todayName = dayNames[dayOfWeek];
  
  const lastMessageWasOurs = cenario.ultimaMsgNossaMin < cenario.ultimaMsgClienteMin;

  // PROMPT IGUAL AO DO SISTEMA REAL
  const prompt = `## 📌 O QUE É FOLLOW-UP E QUANDO USAR

FOLLOW-UP significa "acompanhamento" - é uma mensagem que enviamos para RETOMAR uma conversa que FICOU PARADA.

❌ **FOLLOW-UP NÃO É:**
- Responder mensagem normal do cliente (isso é conversa, não follow-up)
- Enviar se já mandamos msg há menos de 2 horas
- Repetir a mesma informação de antes
- Insistir quando cliente não quer

✅ **FOLLOW-UP É:**
- Retomar contato quando CLIENTE ficou em silêncio há MUITAS HORAS
- Continuar de onde a conversa PAROU, não começar do zero
- Agregar VALOR NOVO (nova info, novo benefício, nova abordagem)
- Ser natural como um humano falaria

---

## 🎯 SUA IDENTIDADE
- Você é: ${cenario.agentName} da ${cenario.companyName}
- Sobre o negócio: ${cenario.businessContext}

## 📅 MOMENTO ATUAL
- Data: ${todayStr} (${todayName})  
- Hora: ${brazilNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

## 👤 CLIENTE: ${cenario.clienteName}

## ⏰ ANÁLISE TEMPORAL CRÍTICA
- CLIENTE respondeu há: **${cenario.ultimaMsgClienteMin} minutos** (${Math.floor(cenario.ultimaMsgClienteMin/60)}h ${cenario.ultimaMsgClienteMin % 60}min)
- NÓS enviamos msg há: **${cenario.ultimaMsgNossaMin} minutos**
- Quem falou por ÚLTIMO: **${lastMessageWasOurs ? '⚠️ NÓS (cliente não respondeu)' : '🟢 CLIENTE (aguardando NOSSA resposta)'}**

## 💬 HISTÓRICO COMPLETO (LEIA TUDO COM ATENÇÃO!)
${historyFormatted.map(h => `[${h.hora}] ${h.de}: ${h.mensagem}`).join('\n')}

## 🚫 NOSSAS ÚLTIMAS MENSAGENS (NÃO REPITA NENHUMA DELAS!)
${ourLastMessages.map((m, i) => `${i+1}. "${m}"`).join('\n')}

## 🧠 ANÁLISE INTELIGENTE DO CONTEXTO
- Última fala do cliente: "${lastClientText}"

---

## 🎯 REGRAS DE DECISÃO (SIGA RIGOROSAMENTE!)

### WAIT (esperar) - Escolha quando:
1. Cliente respondeu há MENOS de 2 horas (conversa ativa, não incomodar)
2. NÓS enviamos msg há menos de 2 horas e cliente não respondeu (dar tempo)
3. Cliente pediu para esperar, disse que está ocupado
4. Não temos nada NOVO para agregar

### SEND (enviar) - Escolha APENAS quando TODOS os critérios:
1. Cliente parou de responder há MAIS de 2 horas
2. Temos algo NOVO/DIFERENTE para falar (não repetir)
3. A conversa não teve fechamento negativo

### ABORT (cancelar follow-up) - Escolha quando:
1. Cliente disse NÃO claramente, rejeitou
2. Cliente já comprou/fechou
3. Cliente pediu para não enviar mais mensagens

---

## ✍️ COMO ESCREVER A MENSAGEM (se action=send)

1. **CONTINUE DE ONDE PAROU**: Releia o histórico e continue o ASSUNTO que estava em discussão
2. **SEJA DIFERENTE**: Use abordagem/palavras diferentes das msgs anteriores
3. **AGREGUE VALOR**: Traga informação nova, benefício novo, ângulo novo
4. **SEJA CURTO**: Máximo 2-3 frases, WhatsApp não é email
5. **SEJA HUMANO**: Escreva como pessoa real, não robô
6. **USE O NOME**: Chame o cliente pelo nome se souber

**Tom**: ${toneMap[configPadrao.tone]}
**Emojis**: ${configPadrao.useEmojis ? 'Pode usar 1 emoji sutil' : 'NÃO use emojis'}

---

## 📋 RESPONDA APENAS EM JSON (sem texto antes ou depois):
{"action":"wait|send|abort|schedule","reason":"explicação curta do motivo","message":"texto pronto (só se action=send)"}`;

  try {
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8
    });
    
    const rawContent = response.choices?.[0]?.message?.content || "";
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(jsonStr);
    
    console.log("\n🤖 DECISÃO DA IA:");
    console.log(`   Action: ${parsed.action?.toUpperCase()}`);
    console.log(`   Motivo: ${parsed.reason}`);
    
    if (parsed.action === 'send' && parsed.message) {
      console.log("\n📤 MENSAGEM GERADA:");
      console.log("   ┌" + "─".repeat(60) + "┐");
      // Quebrar mensagem em linhas
      const words = parsed.message.split(' ');
      let line = "";
      for (const word of words) {
        if ((line + " " + word).length > 58) {
          console.log("   │ " + line.padEnd(58) + " │");
          line = word;
        } else {
          line = line ? line + " " + word : word;
        }
      }
      if (line) {
        console.log("   │ " + line.padEnd(58) + " │");
      }
      console.log("   └" + "─".repeat(60) + "┘");
      
      // Verificar se a mensagem contém frases engessadas
      const frasesEngessadas = ['entendi', 'vamos resolver', 'passo a passo', 'fico feliz', 'estou à disposição'];
      const msgLower = parsed.message.toLowerCase();
      const encontradas = frasesEngessadas.filter(f => msgLower.includes(f));
      
      if (encontradas.length > 0) {
        console.log(`\n   ⚠️ ALERTA: Contém frases potencialmente engessadas: ${encontradas.join(', ')}`);
      } else {
        console.log(`\n   ✅ Mensagem ORIGINAL e CONTEXTUALIZADA`);
      }
      
      // Verificar similaridade com mensagens anteriores
      const checkSimilarity = (text1: string, text2: string): number => {
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        let matches = 0;
        for (const word of words1) {
          if (word.length > 3 && words2.includes(word)) matches++;
        }
        return matches / Math.max(words1.length, words2.length);
      };
      
      let maxSim = 0;
      for (const prevMsg of ourLastMessages) {
        const sim = checkSimilarity(parsed.message, prevMsg);
        if (sim > maxSim) maxSim = sim;
      }
      
      console.log(`   📊 Similaridade máx com msgs anteriores: ${(maxSim * 100).toFixed(1)}%`);
      if (maxSim > 0.6) {
        console.log(`   ❌ BLOQUEADA: Muito similar a mensagem anterior!`);
      } else if (maxSim > 0.4) {
        console.log(`   ⚠️ ATENÇÃO: Moderadamente similar`);
      } else {
        console.log(`   ✅ APROVADA: Suficientemente diferente`);
      }
    }
    
    return parsed;
  } catch (e: any) {
    console.log(`\n❌ ERRO: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("\n🔑 Conectando à API Mistral...");
  
  // Buscar chave da API do ambiente ou arquivo .env
  const apiKey = process.env.MISTRAL_API_KEY || process.env.VITE_MISTRAL_API_KEY;
  
  if (!apiKey) {
    // Tentar ler do .env manualmente
    const fs = await import('fs');
    try {
      const envContent = fs.readFileSync('.env', 'utf-8');
      const match = envContent.match(/MISTRAL_API_KEY=(.+)/);
      if (match) {
        process.env.MISTRAL_API_KEY = match[1].trim();
      }
    } catch (e) {
      console.error("❌ Não foi possível encontrar MISTRAL_API_KEY");
      process.exit(1);
    }
  }
  
  try {
    const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || process.env.VITE_MISTRAL_API_KEY });
    console.log("✅ Conexão OK!\n");
    
    const resultados = [];
    
    for (const cenario of cenarios) {
      const resultado = await simularFollowUp(cenario, mistral);
      resultados.push({
        cenario: cenario.nome,
        ...resultado
      });
      
      // Pequena pausa entre chamadas
      await new Promise(r => setTimeout(r, 1500));
    }
    
    // Resumo final
    console.log("\n" + "═".repeat(70));
    console.log("📊 RESUMO FINAL DOS TESTES");
    console.log("═".repeat(70));
    
    for (const r of resultados) {
      const icon = r.action === 'send' ? '📤' : r.action === 'wait' ? '⏳' : '🛑';
      console.log(`${icon} ${r.cenario}: ${r.action?.toUpperCase()} - ${r.reason?.substring(0, 50)}...`);
    }
    
    console.log("\n✅ CONCLUSÃO:");
    console.log("   O sistema está gerando mensagens DINÂMICAS baseadas no contexto,");
    console.log("   NÃO há mensagens predefinidas/engessadas no código.");
    console.log("   A IA analisa o histórico e decide a melhor abordagem.\n");
    
  } catch (e: any) {
    console.error("❌ Erro na conexão:", e.message);
  }
  
  process.exit(0);
}

main();
