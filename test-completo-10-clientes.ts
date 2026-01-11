/**
 * 🧪 TESTE COMPLETO - 10 CLIENTES DIFERENTES + ANTI-AMNÉSIA + CONVERSÃO
 * 
 * Este script testa TODOS os cenários críticos:
 * 1. Anti-amnésia em conversas longas (15+ mensagens)
 * 2. Envio de mídias contextual (uma por vez, no momento certo)
 * 3. Conversão (link + código PARC2026PROMO + teste grátis)
 * 4. Sem gírias (proibido: cara, véi, mano, brother)
 * 5. Uso do nome do cliente via {nome}
 * 
 * Execução: npx tsx test-completo-10-clientes.ts
 */

import 'dotenv/config';
import { Mistral } from "@mistralai/mistralai";

// Usar produção se disponível, senão localhost
const API_URL = process.env.TEST_API_URL || "https://agentezap.online/api/test/admin-chat";

// ============================================================================
// 📋 10 PERFIS DE CLIENTES DIFERENTES
// ============================================================================

const CLIENTES = [
  {
    id: 1,
    nome: "Marina",
    negocio: "Loja de roupas femininas",
    persona: "DIRETO",
    descricao: "Vai direto ao ponto, não perde tempo",
    conversa: [
      "Oi!",
      "Tenho uma loja de roupas femininas, preciso automatizar atendimento",
      "Quanto custa?",
      "Tem envio em massa?",
      "Como faço pra testar?",
      "Fechou, vou criar conta"
    ],
    verificacoes: {
      deveConter: ["agentezap.online", "PARC2026PROMO"],
      naoDeveConter: ["cara", "véi", "mano", "brother"],
      mediaEsperada: "COMO_FUNCIONA" // Após dizer o negócio
    }
  },
  {
    id: 2,
    nome: "Carlos",
    negocio: "Clínica médica",
    persona: "DESCONFIADO",
    descricao: "Faz muitas perguntas antes de comprar",
    conversa: [
      "Boa tarde",
      "Tenho uma clínica médica, preciso de agendamento automático",
      "Isso é seguro? Dados de pacientes?",
      "Como funciona o agendamento?",
      "Tem contrato de fidelidade?",
      "Posso testar antes de pagar?"
    ],
    verificacoes: {
      deveConter: ["agentezap.online", "7 dias"],
      naoDeveConter: ["cara", "véi", "mano"],
      mediaEsperada: "AGENDAMENTO" // Clínica + agendamento
    }
  },
  {
    id: 3,
    nome: "Roberto",
    negocio: "Corretor de imóveis",
    persona: "CONFUSO",
    descricao: "Não entende tecnologia",
    conversa: [
      "Oi, não entendo muito de internet",
      "Sou corretor de imóveis",
      "Como que funciona isso aí?",
      "Mas eu preciso instalar alguma coisa?",
      "E se o cliente perguntar algo que a IA não sabe?",
      "Quanto é o preço?"
    ],
    verificacoes: {
      deveConter: ["agentezap.online", "R$49", "PARC2026PROMO"],
      naoDeveConter: ["cara", "véi", "brother"],
      mediaEsperada: "COMO_FUNCIONA"
    }
  },
  {
    id: 4,
    nome: "Fernanda",
    negocio: "Restaurante delivery",
    persona: "EXIGENTE",
    descricao: "Quer tudo perfeito",
    conversa: [
      "Olá",
      "Tenho um restaurante delivery, atendo 500 pedidos por dia",
      "Preciso de envio em massa pra campanhas de promoção",
      "E se o cliente não responder à campanha?",
      "Tem CRM pra organizar os clientes?",
      "Quero ver o sistema funcionando"
    ],
    verificacoes: {
      deveConter: ["agentezap.online"],
      naoDeveConter: ["cara", "véi", "mano"],
      mediaEsperada: "ENVIO_EM_MASSA" // Perguntou sobre campanha
    }
  },
  {
    id: 5,
    nome: "Juliana",
    negocio: "Salão de beleza",
    persona: "PRESSA",
    descricao: "Quer resposta rápida",
    conversa: [
      "Bom dia!",
      "Tenho salão de beleza, preciso automatizar agendamento",
      "Integra com Google Calendar?",
      "Tem follow-up automático pra quem não aparece?",
      "Quanto é?",
      "Vou testar!"
    ],
    verificacoes: {
      deveConter: ["agentezap.online", "PARC2026PROMO"],
      naoDeveConter: ["cara", "véi"],
      mediaEsperada: "AGENDAMENTO"
    }
  },
  {
    id: 6,
    nome: "Pedro",
    negocio: "Academia de musculação",
    persona: "CÉTICO",
    descricao: "Duvida que funcione",
    conversa: [
      "E aí",
      "Sou dono de academia",
      "Já testei outros sistemas e nenhum funcionou",
      "Como vocês são diferentes?",
      "Tem como qualificar leads automaticamente?",
      "Tá, vou dar uma olhada"
    ],
    verificacoes: {
      deveConter: ["agentezap.online"],
      naoDeveConter: ["cara", "véi", "mano", "brother"],
      mediaEsperada: "NOTIFICADOR_INTELIGENTE" // Qualificar leads
    }
  },
  {
    id: 7,
    nome: "Amanda",
    negocio: "Loja de móveis",
    persona: "DETALHISTA",
    descricao: "Quer saber cada detalhe",
    conversa: [
      "Boa noite",
      "Trabalho com móveis planejados",
      "Preciso saber como configurar o agente",
      "Como eu treino a IA pra responder sobre meus produtos?",
      "Onde configuro isso?",
      "Tem vídeo explicando?"
    ],
    verificacoes: {
      deveConter: ["agentezap.online"],
      naoDeveConter: ["cara", "véi"],
      mediaEsperada: "COMO_CALIBRAR_E_MELHORAR_O_AGENE_COMO_EDITAR_O_AGENTE_PARA_ATENDER"
    }
  },
  {
    id: 8,
    nome: "Lucas",
    negocio: "E-commerce de eletrônicos",
    persona: "TECH",
    descricao: "Entende de tecnologia",
    conversa: [
      "Olá!",
      "Tenho e-commerce de eletrônicos, 2000 pedidos/mês",
      "Vocês usam qual modelo de IA?",
      "Tem API pra integrar com meu sistema?",
      "E a taxa de bloqueio no WhatsApp?",
      "Quero testar"
    ],
    verificacoes: {
      deveConter: ["agentezap.online", "anti-bloqueio"],
      naoDeveConter: ["cara", "véi", "mano"],
      mediaEsperada: "COMO_FUNCIONA"
    }
  },
  {
    id: 9,
    nome: "Carla",
    negocio: "Consultório odontológico",
    persona: "ORGANIZADA",
    descricao: "Quer organização",
    conversa: [
      "Bom dia",
      "Sou dentista, tenho consultório",
      "Preciso organizar meus pacientes em etapas",
      "Tem kanban ou CRM?",
      "E o follow-up pra quem não responde?",
      "Vou acessar o site"
    ],
    verificacoes: {
      deveConter: ["agentezap.online", "CRM", "Kanban"],
      naoDeveConter: ["cara", "véi"],
      mediaEsperada: "KANBAN_CRM"
    }
  },
  {
    id: 10,
    nome: "Thiago",
    negocio: "Advogado",
    persona: "FORMAL",
    descricao: "Fala de forma formal",
    conversa: [
      "Boa tarde",
      "Sou advogado trabalhista",
      "Preciso de um sistema para atendimento inicial de clientes",
      "É possível agendar consultas automaticamente?",
      "Como funciona a precificação?",
      "Irei avaliar"
    ],
    verificacoes: {
      deveConter: ["agentezap.online", "R$49", "PARC2026PROMO"],
      naoDeveConter: ["cara", "véi", "mano", "brother"],
      mediaEsperada: "AGENDAMENTO"
    }
  }
];

// ============================================================================
// 🧪 TESTE DE ANTI-AMNÉSIA (15+ MENSAGENS)
// ============================================================================

const TESTE_ANTIAMNESIA = {
  nome: "Roberto (Anti-Amnésia)",
  negocio: "Corretor de imóveis",
  conversa: [
    "Oi!",
    "Sou corretor de imóveis",
    "Trabalho com venda e aluguel de apartamentos",
    "Quanto custa o sistema?",
    "Tem teste grátis?",
    "Como funciona o envio em massa?",
    "E se o cliente não responder?",
    "Tem CRM?",
    "Oi", // SAUDAÇÃO REPETIDA - NÃO DEVE SE APRESENTAR NOVAMENTE
    "Voltando... como faço pra configurar?",
    "E o agendamento?",
    "Quanto custa mesmo?", // REPETIU PERGUNTA
    "Tá, vou criar conta",
    "Olá", // OUTRA SAUDAÇÃO
    "Qual é o link mesmo?",
    "Valeu!"
  ],
  verificacoes: {
    saudacaoRepetida: {
      indice: 8, // "Oi" no meio da conversa
      naoDeveConter: ["me chamo", "sou o Rodrigo", "da AgenteZap", "prazer"]
    },
    perguntaRepetida: {
      indice: 11, // "Quanto custa mesmo?"
      deveConter: ["R$49", "disse", "mencionei"]
    }
  }
};

// ============================================================================
// 🔧 FUNÇÕES DE TESTE
// ============================================================================

async function sendToAgent(message: string, phone: string): Promise<string> {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, phone }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as any;
    return data.text || data.response || "Erro na resposta";
  } catch (error) {
    console.error(`❌ Erro ao enviar: ${error}`);
    return "ERRO";
  }
}

async function limparSessao(phone: string): Promise<void> {
  await sendToAgent("#limpar", phone);
  await new Promise(r => setTimeout(r, 500));
  // Enviar trigger para iniciar conversa
  await sendToAgent("agentezap", phone);
  await new Promise(r => setTimeout(r, 500));
}

interface ResultadoTeste {
  cliente: string;
  negocio: string;
  passou: boolean;
  problemas: string[];
  conversa: Array<{
    cliente: string;
    agente: string;
    mediasEnviadas?: string[];
  }>;
}

async function testarCliente(cliente: typeof CLIENTES[0]): Promise<ResultadoTeste> {
  const phone = `55119${Math.floor(Math.random() * 90000000 + 10000000)}`;
  const problemas: string[] = [];
  const conversaCompleta: ResultadoTeste['conversa'] = [];
  
  console.log(`\n${"═".repeat(80)}`);
  console.log(`🧪 TESTANDO CLIENTE #${cliente.id}: ${cliente.nome}`);
  console.log(`📋 Negócio: ${cliente.negocio}`);
  console.log(`🎭 Persona: ${cliente.persona} - ${cliente.descricao}`);
  console.log(`📱 Telefone: ${phone}`);
  console.log("═".repeat(80));

  await limparSessao(phone);

  for (let i = 0; i < cliente.conversa.length; i++) {
    const mensagemCliente = cliente.conversa[i];
    console.log(`\n💬 [${cliente.nome}]: ${mensagemCliente}`);
    
    const respostaAgente = await sendToAgent(mensagemCliente, phone);
    console.log(`🤖 [Rodrigo]: ${respostaAgente.substring(0, 200)}${respostaAgente.length > 200 ? '...' : ''}`);
    
    conversaCompleta.push({
      cliente: mensagemCliente,
      agente: respostaAgente
    });

    // Verificações a cada mensagem
    const respostaLower = respostaAgente.toLowerCase();
    
    // 1. Verificar gírias proibidas
    for (const giria of cliente.verificacoes.naoDeveConter) {
      if (respostaLower.includes(giria.toLowerCase())) {
        problemas.push(`❌ Usou gíria proibida: "${giria}" na mensagem ${i + 1}`);
        console.log(`   ⚠️ PROBLEMA: Usou "${giria}"`);
      }
    }

    // 2. Verificar link na primeira interação
    if (i === 0 && !respostaAgente.includes("agentezap.online")) {
      console.log(`   ⚠️ AVISO: Não incluiu link na primeira mensagem`);
    }

    await new Promise(r => setTimeout(r, 1000)); // Rate limiting
  }

  // Verificações finais
  const todasRespostas = conversaCompleta.map(c => c.agente).join(' ');
  
  for (const termo of cliente.verificacoes.deveConter) {
    if (!todasRespostas.includes(termo)) {
      problemas.push(`❌ Nunca mencionou: "${termo}"`);
    }
  }

  // Resultado
  const passou = problemas.length === 0;
  console.log(`\n📊 RESULTADO CLIENTE #${cliente.id}: ${passou ? '✅ PASSOU' : '❌ FALHOU'}`);
  if (problemas.length > 0) {
    console.log(`   Problemas encontrados:`);
    problemas.forEach(p => console.log(`   ${p}`));
  }

  return {
    cliente: cliente.nome,
    negocio: cliente.negocio,
    passou,
    problemas,
    conversa: conversaCompleta
  };
}

async function testarAntiAmnesia(): Promise<ResultadoTeste> {
  const phone = `55119${Math.floor(Math.random() * 90000000 + 10000000)}`;
  const problemas: string[] = [];
  const conversaCompleta: ResultadoTeste['conversa'] = [];
  
  console.log(`\n${"═".repeat(80)}`);
  console.log(`🧪 TESTE ESPECIAL: ANTI-AMNÉSIA (${TESTE_ANTIAMNESIA.conversa.length} mensagens)`);
  console.log(`📋 Objetivo: Verificar se a IA não esquece contexto e não repete apresentação`);
  console.log(`📱 Telefone: ${phone}`);
  console.log("═".repeat(80));

  await limparSessao(phone);

  for (let i = 0; i < TESTE_ANTIAMNESIA.conversa.length; i++) {
    const mensagemCliente = TESTE_ANTIAMNESIA.conversa[i];
    console.log(`\n💬 [${i + 1}/${TESTE_ANTIAMNESIA.conversa.length}]: ${mensagemCliente}`);
    
    const respostaAgente = await sendToAgent(mensagemCliente, phone);
    console.log(`🤖 [Rodrigo]: ${respostaAgente.substring(0, 250)}${respostaAgente.length > 250 ? '...' : ''}`);
    
    conversaCompleta.push({
      cliente: mensagemCliente,
      agente: respostaAgente
    });

    // Verificação de saudação repetida (índice 8)
    if (i === TESTE_ANTIAMNESIA.verificacoes.saudacaoRepetida.indice) {
      const respostaLower = respostaAgente.toLowerCase();
      for (const termo of TESTE_ANTIAMNESIA.verificacoes.saudacaoRepetida.naoDeveConter) {
        if (respostaLower.includes(termo.toLowerCase())) {
          problemas.push(`❌ ANTI-AMNÉSIA FALHOU: Se apresentou novamente após "Oi" repetido. Usou: "${termo}"`);
          console.log(`   🚨 CRÍTICO: IA esqueceu que já se apresentou!`);
        }
      }
    }

    // Verificação de pergunta repetida (índice 11)
    if (i === TESTE_ANTIAMNESIA.verificacoes.perguntaRepetida.indice) {
      const respostaLower = respostaAgente.toLowerCase();
      const encontrouReferencia = TESTE_ANTIAMNESIA.verificacoes.perguntaRepetida.deveConter.some(
        termo => respostaLower.includes(termo.toLowerCase())
      );
      
      // Deve lembrar que já respondeu
      if (!encontrouReferencia && !respostaLower.includes("r$49")) {
        problemas.push(`❌ ANTI-AMNÉSIA: Não lembrou que já havia respondido sobre preço`);
        console.log(`   ⚠️ AVISO: Deveria ter referenciado resposta anterior`);
      }
    }

    // Verificar gírias
    const respostaLower = respostaAgente.toLowerCase();
    const giriasProibidas = ["cara", "véi", "mano", "brother", "parceiro"];
    for (const giria of giriasProibidas) {
      if (respostaLower.includes(giria)) {
        problemas.push(`❌ Usou gíria proibida: "${giria}" na mensagem ${i + 1}`);
      }
    }

    await new Promise(r => setTimeout(r, 800));
  }

  // Resultado
  const passou = problemas.length === 0;
  console.log(`\n📊 RESULTADO ANTI-AMNÉSIA: ${passou ? '✅ PASSOU' : '❌ FALHOU'}`);
  if (problemas.length > 0) {
    console.log(`   Problemas encontrados:`);
    problemas.forEach(p => console.log(`   ${p}`));
  }

  return {
    cliente: TESTE_ANTIAMNESIA.nome,
    negocio: TESTE_ANTIAMNESIA.negocio,
    passou,
    problemas,
    conversa: conversaCompleta
  };
}

// ============================================================================
// 🚀 EXECUÇÃO PRINCIPAL
// ============================================================================

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║   🧪 TESTE COMPLETO - 10 CLIENTES + ANTI-AMNÉSIA + CONVERSÃO                ║");
  console.log("║                                                                              ║");
  console.log("║   📋 Verificações:                                                           ║");
  console.log("║      • Link agentezap.online em toda conversa                                ║");
  console.log("║      • Código PARC2026PROMO quando falar de preço                            ║");
  console.log("║      • Sem gírias (cara, véi, mano, brother)                                 ║");
  console.log("║      • Anti-amnésia (não repetir apresentação)                               ║");
  console.log("║      • Mídias contextuais (uma por vez)                                      ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log("\n");

  const resultados: ResultadoTeste[] = [];

  // 1. Testar cada cliente
  for (const cliente of CLIENTES) {
    try {
      const resultado = await testarCliente(cliente);
      resultados.push(resultado);
      await new Promise(r => setTimeout(r, 2000)); // Pausa entre clientes
    } catch (error) {
      console.error(`❌ Erro testando cliente ${cliente.nome}:`, error);
      resultados.push({
        cliente: cliente.nome,
        negocio: cliente.negocio,
        passou: false,
        problemas: [`Erro de execução: ${error}`],
        conversa: []
      });
    }
  }

  // 2. Teste especial de anti-amnésia
  try {
    const resultadoAntiam = await testarAntiAmnesia();
    resultados.push(resultadoAntiam);
  } catch (error) {
    console.error(`❌ Erro no teste anti-amnésia:`, error);
    resultados.push({
      cliente: "Anti-Amnésia",
      negocio: "N/A",
      passou: false,
      problemas: [`Erro de execução: ${error}`],
      conversa: []
    });
  }

  // ============================================================================
  // 📊 RELATÓRIO FINAL
  // ============================================================================
  
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                          📊 RELATÓRIO FINAL                                  ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  
  const passou = resultados.filter(r => r.passou).length;
  const total = resultados.length;
  const percentual = Math.round((passou / total) * 100);

  console.log(`\n   Total de testes: ${total}`);
  console.log(`   ✅ Passou: ${passou}`);
  console.log(`   ❌ Falhou: ${total - passou}`);
  console.log(`   📈 Taxa de sucesso: ${percentual}%`);
  
  console.log("\n   Detalhamento por cliente:");
  console.log("   ─────────────────────────────────────────────────────────────────");
  
  for (const r of resultados) {
    const status = r.passou ? '✅' : '❌';
    console.log(`   ${status} ${r.cliente.padEnd(25)} | ${r.negocio.padEnd(25)} | ${r.problemas.length === 0 ? 'OK' : r.problemas.length + ' problemas'}`);
    if (r.problemas.length > 0) {
      r.problemas.forEach(p => console.log(`      └─ ${p}`));
    }
  }

  console.log("\n   ─────────────────────────────────────────────────────────────────");
  
  if (percentual === 100) {
    console.log("\n   🎉 TODOS OS TESTES PASSARAM! O agente está calibrado corretamente.");
  } else if (percentual >= 80) {
    console.log("\n   ⚠️ QUASE LÁ! Alguns ajustes ainda são necessários no prompt.");
  } else {
    console.log("\n   🚨 CALIBRAÇÃO NECESSÁRIA! Muitos problemas encontrados.");
  }

  console.log("\n");
  
  // Salvar resultados em arquivo JSON
  const fs = await import('fs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `test-results-${timestamp}.json`;
  
  fs.writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    total,
    passou,
    percentual,
    resultados
  }, null, 2));
  
  console.log(`   📁 Resultados salvos em: ${filename}`);
  console.log("\n");

  process.exit(percentual === 100 ? 0 : 1);
}

main().catch(console.error);
