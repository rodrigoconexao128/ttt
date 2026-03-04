
import { generateAIResponse } from './server/aiAgent';
import type { Message } from '@shared/schema';

// Configuração de Teste
const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

// Interface para os cenários
interface CenarioTeste {
  nome: string;
  tipoNegocio: string;
  promptSistema: string;
  historico: Message[];
  novaMensagem: string;
  verificacoes: Array<{ tipo: 'NAO_CONTEM' | 'CONTEM' | 'CONTEM_UM_DE', valor: string | string[], descricao: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 10 CENÁRIOS DE TESTE (DIFERENTES NEGÓCIOS)
// ═══════════════════════════════════════════════════════════════════════════

const CENARIOS: CenarioTeste[] = [
  // 1. IMOBILIÁRIA
  {
    nome: "1. Imobiliária - Cliente manda 'Oi' no meio",
    tipoNegocio: "Imobiliária",
    promptSistema: "Você é Ana, corretora da Imóveis Deluxe. Vende apartamentos de alto padrão. Pergunte sobre localização e orçamento.",
    historico: [
      { fromMe: false, text: "Oi", timestamp: new Date() },
      { fromMe: true, text: "Olá! Sou Ana da Imóveis Deluxe. Buscando apartamento para morar ou investir?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Morar", timestamp: new Date() },
      { fromMe: true, text: "Perfeito. Qual bairro você prefere?", timestamp: new Date(), isFromAgent: true },
    ],
    novaMensagem: "Oi",
    verificacoes: [
      { tipo: "NAO_CONTEM", valor: "Sou Ana", descricao: "Não deve se apresentar de novo" },
      { tipo: "NAO_CONTEM", valor: "morar ou investir", descricao: "Não deve repetir pergunta inicial" },
      { tipo: "CONTEM_UM_DE", valor: ["ajudar", "algo", "dúvida", "continuar", "prefere"], descricao: "Deve oferecer ajuda ou retomar" }
    ]
  },

  // 2. DENTISTA
  {
    nome: "2. Dentista - Repetição de pergunta de preço",
    tipoNegocio: "Clínica Odontológica",
    promptSistema: "Você é a Secretária da Dr. Sorriso. Agende limpezas e consultas. Limpeza custa R$ 200.",
    historico: [
      { fromMe: false, text: "Quanto é a limpeza?", timestamp: new Date() },
      { fromMe: true, text: "A limpeza completa custa R$ 200. Quer agendar?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Vou ver", timestamp: new Date() },
    ],
    novaMensagem: "Qual o valor mesmo?",
    verificacoes: [
      { tipo: "CONTEM", valor: "200", descricao: "Deve confirmar o valor" },
      { tipo: "CONTEM_UM_DE", valor: ["como disse", "mencionei", "informei", "R$"], descricao: "Deve referenciar que já falou ou ser direto" }
    ]
  },

  // 3. PIZZARIA
  {
    nome: "3. Pizzaria - Saudação 'Boa noite' no meio",
    tipoNegocio: "Pizzaria",
    promptSistema: "Você é o Pizzaiolo Virtual da Pizza Express. Temos Calabresa, Mussarela e Portuguesa. Peça o sabor e endereço.",
    historico: [
      { fromMe: false, text: "Quero pedir", timestamp: new Date() },
      { fromMe: true, text: "Claro! Temos Calabresa, Mussarela e Portuguesa. Qual vai ser?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Calabresa", timestamp: new Date() },
      { fromMe: true, text: "Ótima escolha! Qual o endereço de entrega?", timestamp: new Date(), isFromAgent: true },
    ],
    novaMensagem: "Boa noite",
    verificacoes: [
      { tipo: "NAO_CONTEM", valor: "Temos Calabresa", descricao: "Não deve listar sabores de novo" },
      { tipo: "CONTEM_UM_DE", valor: ["endereço", "entrega", "anotar", "pedido", "ajudar", "posso"], descricao: "Deve focar no endereço ou pedido ou oferecer ajuda" }
    ]
  },

  // 4. ACADEMIA
  {
    nome: "4. Academia - Pergunta genérica após preço",
    tipoNegocio: "Academia FitLife",
    promptSistema: "Você é instrutor da FitLife. Planos a partir de R$ 89. Temos musculação e aulas.",
    historico: [
      { fromMe: false, text: "Preço?", timestamp: new Date() },
      { fromMe: true, text: "Nossos planos começam em R$ 89 mensais com tudo incluso.", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Legal", timestamp: new Date() },
    ],
    novaMensagem: "Como funciona?",
    verificacoes: [
      { tipo: "NAO_CONTEM", valor: "R$ 89", descricao: "Não precisa repetir preço se não perguntou" },
      { tipo: "CONTEM_UM_DE", valor: ["musculação", "aulas", "treino", "horário"], descricao: "Deve explicar funcionamento" }
    ]
  },

  // 5. ADVOCACIA
  {
    nome: "5. Advocacia - Resposta curta 'Sim'",
    tipoNegocio: "Escritório Jurídico",
    promptSistema: "Assistente Jurídico. Faça triagem de causas trabalhistas e cíveis. Pergunte a área e o problema.",
    historico: [
      { fromMe: false, text: "Preciso de advogado", timestamp: new Date() },
      { fromMe: true, text: "Olá. Qual a área do seu caso? Trabalhista ou Cível?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Trabalhista", timestamp: new Date() },
      { fromMe: true, text: "Entendi. Você foi demitido recentemente?", timestamp: new Date(), isFromAgent: true },
    ],
    novaMensagem: "Sim",
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["quanto tempo", "justa causa", "aviso", "detalhes", "entendo", "motivo", "demissão", "reivindicar", "direitos", "ação"], descricao: "Deve pedir mais detalhes ou oferecer ação" },
      { tipo: "NAO_CONTEM", valor: "Trabalhista ou Cível", descricao: "Não deve voltar ao início" }
    ]
  },

  // 6. LOJA DE ROUPAS
  {
    nome: "6. Loja de Roupas - Emoji",
    tipoNegocio: "Moda Fashion",
    promptSistema: "Consultora de Moda. Vende vestidos e blusas. Pergunte tamanho e ocasião.",
    historico: [
      { fromMe: false, text: "Tem vestido vermelho?", timestamp: new Date() },
      { fromMe: true, text: "Temos sim! Longo ou curto?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Curto", timestamp: new Date() },
      { fromMe: true, text: "Lindo! Qual seu tamanho?", timestamp: new Date(), isFromAgent: true },
    ],
    novaMensagem: "👍",
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["tamanho", "medida", "P", "M", "G", "ajudar", "opções"], descricao: "Deve insistir no tamanho ou oferecer ajuda" }
    ]
  },

  // 7. SUPORTE SAAS
  {
    nome: "7. Suporte SaaS - Saudação informal 'E aí'",
    tipoNegocio: "TechSupport",
    promptSistema: "Suporte Técnico. Ajude com erros de login e senha.",
    historico: [
      { fromMe: false, text: "Não consigo logar", timestamp: new Date() },
      { fromMe: true, text: "Aparece alguma mensagem de erro?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Erro 500", timestamp: new Date() },
      { fromMe: true, text: "Isso é erro no servidor. Tente limpar o cache.", timestamp: new Date(), isFromAgent: true },
    ],
    novaMensagem: "E aí",
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["funcionou", "conseguiu", "cache", "ajudar", "deu certo", "resolver"], descricao: "Deve perguntar se resolveu" },
      { tipo: "NAO_CONTEM", valor: "mensagem de erro", descricao: "Não deve voltar ao início" }
    ]
  },

  // 8. CONCESSIONÁRIA
  {
    nome: "8. Concessionária - Áudio (simulado)",
    tipoNegocio: "AutoCar",
    promptSistema: "Vendedor de Carros. Vende Gol, Onix e HB20. Pergunte modelo e financiamento.",
    historico: [
      { fromMe: false, text: "Preço do Onix?", timestamp: new Date() },
      { fromMe: true, text: "O Onix está saindo por R$ 80k. Tem interesse em financiar?", timestamp: new Date(), isFromAgent: true },
    ],
    novaMensagem: "(mensagem de voz)", // Simulando texto que o sistema passaria
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["ouvir", "áudio", "entendi", "falar", "escrever", "dúvida", "entrada", "parcelas"], descricao: "Deve reagir ao áudio ou pedir para escrever" }
    ]
  },

  // 9. SALÃO DE BELEZA
  {
    nome: "9. Salão de Beleza - Repetição 'Qual valor?'",
    tipoNegocio: "Beauty Salon",
    promptSistema: "Recepcionista. Corte R$ 50, Barba R$ 30. Agende horário.",
    historico: [
      { fromMe: false, text: "Quanto é o corte?", timestamp: new Date() },
      { fromMe: true, text: "O corte masculino é R$ 50. Quer agendar para hoje?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "E a barba?", timestamp: new Date() },
      { fromMe: true, text: "A barba é R$ 30.", timestamp: new Date(), isFromAgent: true },
    ],
    novaMensagem: "Mas qual o valor do corte?",
    verificacoes: [
      { tipo: "CONTEM", valor: "50", descricao: "Deve repetir o valor 50" },
      { tipo: "NAO_CONTEM", valor: "barba", descricao: "Não precisa falar da barba agora" }
    ]
  },

  // 10. CURSO DE INGLÊS
  {
    nome: "10. Curso de Inglês - Saudação 'Hello'",
    tipoNegocio: "English School",
    promptSistema: "You are a Teacher Assistant. Sell English courses. Ask about level (Basic, Intermediate).",
    historico: [
      { fromMe: false, text: "Hi", timestamp: new Date() },
      { fromMe: true, text: "Hello! I'm the assistant. What is your English level?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Basic", timestamp: new Date() },
      { fromMe: true, text: "Great! We have a starter class. Want to try?", timestamp: new Date(), isFromAgent: true },
    ],
    novaMensagem: "Hello",
    verificacoes: [
      { tipo: "NAO_CONTEM", valor: "What is your English level", descricao: "Don't ask level again" },
      { tipo: "CONTEM_UM_DE", valor: ["help", "question", "class", "try", "assist"], descricao: "Offer help" }
    ]
  },
  // 11. AGENTEZAP (CASO REAL DO USUÁRIO)
  {
    nome: "11. AgentZap - Resposta Dupla/Concatenada",
    tipoNegocio: "SaaS de IA",
    promptSistema: "Você é o Atendente da AgenteZap. Venda automação de WhatsApp com IA. O plano custa R$ 99/mês. Explique como funciona e depois ofereça exemplo.",
    historico: [
      { fromMe: false, text: "Oi", timestamp: new Date() },
      { fromMe: true, text: "Olá! Sou da AgenteZap. Quer saber como a IA pode vender por você?", timestamp: new Date(), isFromAgent: true },
      { fromMe: false, text: "Quero entender", timestamp: new Date() },
    ],
    novaMensagem: "Como funciona?",
    verificacoes: [
      { tipo: "CONTEM", valor: "99", descricao: "Deve mencionar o preço ou explicação" },
      { tipo: "NAO_CONTEM", valor: "Ótimo, Rodrigo! Vou te mostrar", descricao: "Não deve emendar a próxima etapa (alucinação de auto-conversa)" },
      { tipo: "NAO_CONTEM", valor: "Perfeito, Rodrigo", descricao: "Não deve repetir o nome do cliente de forma estranha se não for o nome dele" }
    ]
  }
];
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('🚀 INICIANDO BATERIA DE 10 TESTES DE CONTINUIDADE (MULTICENÁRIO)\n');
  
  let passed = 0;
  let failed = 0;

  for (const cenario of CENARIOS) {
    console.log(`\n──────────────────────────────────────────────────────────────`);
    console.log(`🧪 TESTE: ${cenario.nome}`);
    console.log(`🏢 Negócio: ${cenario.tipoNegocio}`);
    console.log(`──────────────────────────────────────────────────────────────`);

    // Mock Dependencies
    const mockDependencies = {
      getAgentConfig: async () => ({
        isActive: true,
        model: 'mistral-small-latest',
        prompt: cenario.promptSistema,
        fetchHistoryOnFirstResponse: true // Importante para ativar lógica de histórico
      }),
      getBusinessAgentConfig: async () => null, // Usar legacy para simplificar ou mockar se precisar
      getAgentMediaLibrary: async () => []
    };

    try {
      const result = await generateAIResponse(
        'test-user-id',
        cenario.historico,
        cenario.novaMensagem,
        { contactName: 'Cliente Teste' },
        mockDependencies
      );

      if (!result || !result.text) {
        throw new Error("IA não retornou resposta");
      }

      const responseText = result.text;
      console.log(`🤖 RESPOSTA IA: "${responseText}"`);

      // Verificações
      const errors: string[] = [];
      const responseLower = responseText.toLowerCase();

      for (const check of cenario.verificacoes) {
        if (check.tipo === 'NAO_CONTEM') {
          const val = Array.isArray(check.valor) ? check.valor : [check.valor];
          for (const v of val) {
            if (responseLower.includes(v.toLowerCase())) {
              errors.push(`❌ FALHOU: Contém "${v}" proibido. (${check.descricao})`);
            }
          }
        } else if (check.tipo === 'CONTEM') {
          const val = check.valor as string;
          if (!responseLower.includes(val.toLowerCase())) {
            errors.push(`❌ FALHOU: Não contém "${val}" obrigatório. (${check.descricao})`);
          }
        } else if (check.tipo === 'CONTEM_UM_DE') {
          const vals = check.valor as string[];
          const hasOne = vals.some(v => responseLower.includes(v.toLowerCase()));
          if (!hasOne) {
            errors.push(`❌ FALHOU: Não contém nenhuma das palavras: ${vals.join(', ')}. (${check.descricao})`);
          }
        }
      }

      if (errors.length === 0) {
        console.log(`✅ PASSOU`);
        passed++;
      } else {
        console.log(`❌ FALHOU`);
        errors.forEach(e => console.log(e));
        failed++;
      }

    } catch (err: any) {
      console.error(`💥 ERRO DE EXECUÇÃO:`, err.message);
      failed++;
    }
    
    // Delay para não estourar rate limit
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`📊 RESULTADO FINAL: ${passed}/${CENARIOS.length} PASSARAM`);
  console.log(`══════════════════════════════════════════════════════════════`);
}

runTests();
