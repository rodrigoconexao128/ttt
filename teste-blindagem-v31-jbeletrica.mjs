/**
 * TESTE ESPECÍFICO: Blindagem V3.1 - Caso JB ELÉTRICA
 * 
 * Este teste verifica que a nova pré-blindagem previne a alucinação
 * onde a IA respondia sobre "cardápio/delivery" para uma empresa
 * de serviços elétricos
 */

import Mistral from "@mistralai/mistralai";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';
const mistral = new Mistral.default({ apiKey: MISTRAL_API_KEY });

// Simular o prompt da JB ELÉTRICA (resumido para teste)
const JB_ELETRICA_PROMPT = `# AGENTE JB ELÉTRICA – PROMPT OFICIAL

## BLOCO 1 – IDENTIDADE, TOM E COMPORTAMENTO

Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.

Objetivo:
- Fazer o primeiro atendimento de forma humana, clara e prática
- Coletar informações essenciais sem virar interrogatório
- Respeitar rigorosamente as regras globais

SERVIÇOS OFERECIDOS:
- Troca de tomada: R$ 55,00
- Troca de interruptor: R$ 55,00
- Instalação de chuveiro: R$ 95,00
- Instalação de ventilador de teto: R$ 120,00

Horário de Atendimento:
- Segunda a sexta: 08h às 12h | 13h30 às 18h
`;

// Função para simular a análise do prompt (igual ao código original)
function analyzeUserPrompt(prompt) {
  const analysis = {
    businessName: 'nosso serviço',
    businessType: 'atendimento',
    services: [],
    identity: 'atendente',
    hasProducts: false,
    hasScheduling: false,
    hasDelivery: false,
    topics: [],
    constraints: [],
    originalPromptLength: prompt.length,
  };

  // Extrair nome do negócio
  const matchNegocio = prompt.match(/\*\*([^*]+)\*\*/) || 
                       prompt.match(/^#\s*AGENTE\s+([^\n–-]+)/im);
  if (matchNegocio) {
    analysis.businessName = matchNegocio[1].split('–')[0].split('-')[0].trim();
    analysis.businessName = analysis.businessName.replace(/[^\w\sáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]/gi, '').trim() || 'nosso serviço';
  }

  // Detectar tipo de negócio (ORDEM IMPORTA - mais específicos primeiro)
  const businessTypes = [
    ['elétrica', /elétric|eletric|tomada|interruptor|disjuntor|instalação elétrica|fiação|rede elétrica/i],
    ['hidráulica', /hidráulic|encanador|vazamento|cano|torneira|descarga|esgoto/i],
    ['construção', /construção|pedreiro|obra|reforma|alvenaria|acabamento/i],
    ['mecânica', /mecânic|oficina|carro|moto|veículo|motor|conserto/i],
    ['TI/Suporte', /suporte|ti|informática|computador|notebook|software|sistema/i],
    ['clínica', /clínica|médic|saúde|consulta|exame|doutor|psicólog|terapeut|odonto|dentista/i],
    ['terapia', /terapi|psico|coaching|conselheiro|acompanhamento|emocional/i],
    ['salão', /salão|beleza|cabelo|unha|estética|manicure|pedicure|cabeleireiro/i],
    ['educação', /curso|aula|professor|escola|treino|treinamento|mentoria/i],
    ['imobiliária', /imóv|casa|apartamento|alug|vend.*imóv|corretor|corretora/i],
    ['pet', /pet|cachorro|gato|animal|veterinár/i],
    ['delivery', /cardápio|menu\s+de\s+comida|pedido\s+de\s+comida|delivery\s+de\s+comida|entrega\s+de\s+alimento/i],
    ['restaurante', /restaurante|lanchonete|pizzaria|hamburgueria|comida|aliment|refeição|prato|sabor/i],
    ['loja', /loja|produtos|vend|preço|compra/i],
    ['serviços', /serviço|consult|atend|orçamento/i],
  ];

  for (const [type, regex] of businessTypes) {
    if (regex.test(prompt)) {
      analysis.businessType = type;
      break;
    }
  }

  // Extrair identidade/nome do assistente
  const matchIdentidade = prompt.match(/(?:você é|sou|me chamo|atendente)\s+(?:o\s+|a\s+)?(\w+)/i);
  if (matchIdentidade) {
    analysis.identity = matchIdentidade[1];
  }

  return analysis;
}

// Nova função: Gerar Pré-Blindagem
function generatePreBlindagem(analysis) {
  const isNotFood = !['restaurante', 'delivery'].includes(analysis.businessType);
  const isService = ['elétrica', 'hidráulica', 'construção', 'mecânica', 'TI/Suporte', 'serviços'].includes(analysis.businessType);
  const isHealth = ['clínica', 'terapia'].includes(analysis.businessType);
  
  let antiHallucination = '';
  
  if (isNotFood && isService) {
    antiHallucination = `
⛔ PROIBIÇÃO ABSOLUTA - NUNCA MENCIONE:
- Cardápio, menu, delivery, entrega de comida
- Pedidos de comida, restaurante, lanchonete
- Preços de comida, bebidas, refeições
ESTE É UM NEGÓCIO DE ${analysis.businessType.toUpperCase()}, NÃO DE ALIMENTAÇÃO!`;
  } else if (isNotFood && isHealth) {
    antiHallucination = `
⛔ PROIBIÇÃO ABSOLUTA - NUNCA MENCIONE:
- Cardápio, menu, delivery, entrega de comida
- Pedidos de comida, restaurante, lanchonete
ESTE É UM NEGÓCIO DE SAÚDE/TERAPIA, NÃO DE ALIMENTAÇÃO!`;
  } else if (isNotFood) {
    antiHallucination = `
⛔ PROIBIÇÃO ABSOLUTA - NUNCA MENCIONE:
- Cardápio, menu, delivery (a menos que esteja no prompt abaixo)
FOQUE APENAS no escopo de ${analysis.businessName}!`;
  }

  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║ 🛡️ PRÉ-BLINDAGEM V3.1 - IDENTIDADE OBRIGATÓRIA                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ VOCÊ É: ${analysis.identity.padEnd(62)}║
║ NEGÓCIO: ${analysis.businessName.substring(0, 60).padEnd(61)}║
║ TIPO: ${analysis.businessType.toUpperCase().padEnd(64)}║
╠══════════════════════════════════════════════════════════════════════════════╣
║ ⚠️ LEIA TODO O PROMPT ABAIXO ANTES DE RESPONDER                              ║
║ ⚠️ RESPONDA APENAS SOBRE O QUE ESTÁ NO PROMPT                                ║
║ ⚠️ NUNCA INVENTE INFORMAÇÕES QUE NÃO ESTÃO ESCRITAS                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${antiHallucination}

`;
}

// Blindagem Universal simplificada
function generateBlindagem(analysis) {
  return `
═══════════════════════════════════════════════════════════════════════════════════
🛡️ BLINDAGEM UNIVERSAL V3.1
═══════════════════════════════════════════════════════════════════════════════════

📌 CONTEXTO DETECTADO:
- Negócio: ${analysis.businessName}
- Tipo: ${analysis.businessType}
- Sua identidade: ${analysis.identity} de ${analysis.businessName}

🔒 REGRA 1 - ANTI-ALUCINAÇÃO:
- Responda APENAS com informações do prompt
- Se não souber, diga "não tenho essa informação"
- NUNCA invente serviços, preços ou horários

🚫 REGRA 2 - ESCOPO FECHADO:
- Você SÓ existe para ${analysis.businessName}
- Fale APENAS sobre serviços elétricos
- NÃO mencione comida, restaurante, delivery
`;
}

// Mensagens de teste - cenários que causavam alucinação
const testMessages = [
  { userMessage: "Oi", expectedTopics: ["elétric", "serviço", "tomada", "interruptor", "ajudar"], forbiddenTopics: ["cardápio", "delivery", "menu", "comida"] },
  { userMessage: "Olá", expectedTopics: ["elétric", "serviço", "ajudar"], forbiddenTopics: ["cardápio", "delivery", "menu", "comida"] },
  { userMessage: "Instalar tomada", expectedTopics: ["tomada", "R$", "55", "valor", "instala"], forbiddenTopics: ["cardápio", "delivery", "menu", "comida"] },
  { userMessage: "Quero um orçamento", expectedTopics: ["serviço", "elétric", "orçamento", "ajudar"], forbiddenTopics: ["cardápio", "delivery", "menu", "comida"] },
  { userMessage: "Bom dia", expectedTopics: ["ajudar", "serviço"], forbiddenTopics: ["cardápio", "delivery", "menu", "comida"] },
];

// Função principal de teste
async function runTests() {
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE: Blindagem V3.1 - Caso JB ELÉTRICA (Anti-Alucinação)");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

  // Analisar o prompt
  const analysis = analyzeUserPrompt(JB_ELETRICA_PROMPT);
  console.log(`📊 Análise do Prompt:`);
  console.log(`   - Negócio: ${analysis.businessName}`);
  console.log(`   - Tipo: ${analysis.businessType}`);
  console.log(`   - Identidade: ${analysis.identity}\n`);

  // Verificar se detectou corretamente como elétrica (não restaurante/delivery)
  if (analysis.businessType !== 'elétrica') {
    console.log(`❌ ERRO: Tipo de negócio detectado incorretamente!`);
    console.log(`   Esperado: "elétrica", Recebido: "${analysis.businessType}"`);
    process.exit(1);
  }
  console.log(`✅ Tipo de negócio detectado corretamente: ${analysis.businessType}\n`);

  // Gerar prompts blindados
  const preBlindagem = generatePreBlindagem(analysis);
  const blindagem = generateBlindagem(analysis);
  
  const systemPrompt = preBlindagem + JB_ELETRICA_PROMPT + blindagem;

  console.log(`📝 Sistema prompt gerado (${systemPrompt.length} chars)\n`);
  
  let passed = 0;
  let failed = 0;

  for (const test of testMessages) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🧪 Testando: "${test.userMessage}"`);
    
    try {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: test.userMessage }
        ],
        maxTokens: 500,
        temperature: 0.0,
        randomSeed: 42,
      });

      const aiResponse = response.choices[0].message.content.toLowerCase();
      console.log(`📤 Resposta: "${response.choices[0].message.content.substring(0, 150)}..."`);
      
      // Verificar se contém tópicos proibidos
      const hasForbidden = test.forbiddenTopics.some(topic => aiResponse.includes(topic.toLowerCase()));
      
      if (hasForbidden) {
        console.log(`❌ FALHOU - Contém tópicos proibidos (cardápio/delivery/menu/comida)`);
        failed++;
      } else {
        console.log(`✅ PASSOU - Sem menção a cardápio/delivery`);
        passed++;
      }
      
    } catch (error) {
      console.log(`❌ ERRO na API: ${error.message}`);
      failed++;
    }
    
    // Pequena pausa entre requisições
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n═══════════════════════════════════════════════════════════════════════════════`);
  console.log(`📊 RESULTADO FINAL: ${passed}/${testMessages.length} testes passaram`);
  console.log(`   ✅ Passou: ${passed}`);
  console.log(`   ❌ Falhou: ${failed}`);
  console.log(`   Taxa de sucesso: ${((passed / testMessages.length) * 100).toFixed(1)}%`);
  console.log(`═══════════════════════════════════════════════════════════════════════════════`);
  
  if (failed > 0) {
    console.log(`\n⚠️ ATENÇÃO: Ainda há alucinações sobre cardápio/delivery!`);
    process.exit(1);
  } else {
    console.log(`\n✅ SUCESSO: Blindagem V3.1 preveniu todas as alucinações!`);
  }
}

runTests().catch(console.error);
