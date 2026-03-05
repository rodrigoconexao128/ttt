
import * as dotenv from 'dotenv';
dotenv.config();

import { db } from './server/db';
import { aiAgentConfig } from './shared/schema';
import { eq } from 'drizzle-orm';
import { generateAIResponse } from './server/aiAgent';
import type { Message } from './shared/schema';

const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735'; // rodrigo4@gmail.com

// Definição dos cenários de teste
const SCENARIOS = [
  {
    name: "🍕 Pizzaria Bella Napoli",
    prompt: `## IDENTIDADE
Você é o Luigi, atendente virtual da Pizzaria Bella Napoli.
Você deve anotar pedidos de pizza.
Cardápio:
- Calabresa: R$ 40
- Mussarela: R$ 38
- Portuguesa: R$ 45
Taxa de entrega: R$ 5,00.
Seja simpático e use emojis de pizza.`,
    tests: [
      {
        name: "Cliente pede cardápio e depois manda 'oi' de novo",
        history: [
          { fromMe: false, text: "Oi, quero pedir pizza" },
          { fromMe: true, text: "Olá! Sou o Luigi 🍕. Temos Calabresa (R$40), Mussarela (R$38) e Portuguesa (R$45). Qual vai querer?", isFromAgent: true }
        ],
        newMessage: "Oi",
        shouldNotContain: ["Sou o Luigi", "Olá! Sou o Luigi"], // Não deve se apresentar de novo
        shouldContain: ["ajudar", "pedido", "escolheu", "sabor", "pizza"]
      },
      {
        name: "Cliente escolhe sabor e depois pergunta preço de novo",
        history: [
            { fromMe: false, text: "Quero uma de Calabresa" },
            { fromMe: true, text: "Ótima escolha! 🍕 Calabresa sai por R$ 40. Vai querer borda recheada?", isFromAgent: true },
            { fromMe: false, text: "Não, sem borda" },
            { fromMe: true, text: "Certo, sem borda. O total é R$ 45 com a entrega. Qual o endereço?", isFromAgent: true }
        ],
        newMessage: "Quanto custa a de calabresa mesmo?",
        shouldNotContain: ["Sou o Luigi"],
        shouldContain: ["40", "quarenta"]
      }
    ]
  },
  {
    name: "🦷 Clínica Sorriso Radiante",
    prompt: `## IDENTIDADE
Você é a Ana, secretária da Clínica Sorriso Radiante.
Seu objetivo é agendar consultas.
Horários: Seg-Sex das 9h às 18h.
Valor da avaliação: Gratuita.
Limpeza: R$ 150.
Seja formal e educada.`,
    tests: [
      {
        name: "Cliente pergunta horário e depois manda 'olá'",
        history: [
          { fromMe: false, text: "Bom dia, queria marcar" },
          { fromMe: true, text: "Bom dia! Sou a Ana. Temos horários disponíveis para hoje à tarde. Qual sua preferência?", isFromAgent: true }
        ],
        newMessage: "Olá",
        shouldNotContain: ["Sou a Ana", "Bom dia! Sou a Ana"],
        shouldContain: ["ajudar", "marcar", "horário", "preferência", "consulta"]
      },
      {
        name: "Cliente confirma horário e manda emoji",
        history: [
            { fromMe: false, text: "Pode ser as 14h?" },
            { fromMe: true, text: "Perfeito, 14h reservado. Preciso do seu nome completo.", isFromAgent: true }
        ],
        newMessage: "👍",
        shouldNotContain: ["Sou a Ana"],
        shouldContain: ["nome", "completo", "aguardo", "obrigada"]
      }
    ]
  },
  {
    name: "🏠 Imobiliária Teto Seguro",
    prompt: `## IDENTIDADE
Você é o Carlos, corretor da Imobiliária Teto Seguro.
Você ajuda clientes a encontrar imóveis para alugar.
Temos apartamentos no Centro (R$ 1500) e Casas no Bairro Jardim (R$ 2500).
Documentos necessários: RG, CPF e Comprovante de Renda.`,
    tests: [
       {
        name: "Cliente pergunta documentos e depois manda 'tudo bem?'",
        history: [
          { fromMe: false, text: "Quais documentos precisa?" },
          { fromMe: true, text: "Olá! Sou o Carlos. Precisa de RG, CPF e Comprovante de Renda.", isFromAgent: true }
        ],
        newMessage: "Tudo bem?",
        shouldNotContain: ["Sou o Carlos", "Olá! Sou o Carlos"],
        shouldContain: ["ajudar", "imóvel", "dúvida", "documentos", "procura"]
      },
      {
        name: "Cliente diz o que quer na mensagem de saudação repetida",
        history: [
            { fromMe: false, text: "Oi" },
            { fromMe: true, text: "Olá! Sou o Carlos da Imobiliária. Como posso ajudar?", isFromAgent: true }
        ],
        newMessage: "Oi, eu quero alugar um apartamento no centro",
        shouldNotContain: ["o que você procura", "posso ajudar"], // Não deve perguntar de novo, deve responder sobre o ap
        shouldContain: ["1500", "centro", "temos", "disponível"]
      }
    ]
  }
];

async function runTests() {
  console.log("🚀 INICIANDO TESTES DE CENÁRIOS VARIADOS (ANTI-AMNESIA)\n");

  // 1. Backup do prompt original
  console.log("💾 Fazendo backup do prompt original...");
  const originalConfig = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, USER_ID));
  
  if (!originalConfig.length) {
    console.error("❌ Usuário não encontrado!");
    process.exit(1);
  }
  
  const originalPrompt = originalConfig[0].prompt;
  console.log("✅ Backup realizado com sucesso.\n");

  try {
    for (const scenario of SCENARIOS) {
      console.log(`\n════════════════════════════════════════════════════════════════`);
      console.log(`🏢 CENÁRIO: ${scenario.name}`);
      console.log(`════════════════════════════════════════════════════════════════`);

      // 2. Atualizar prompt para o cenário atual
      await db.update(aiAgentConfig)
        .set({ prompt: scenario.prompt })
        .where(eq(aiAgentConfig.userId, USER_ID));
      
      console.log("📝 Prompt atualizado no banco de dados.");

      for (const test of scenario.tests) {
        console.log(`\n🧪 Teste: ${test.name}`);
        
        // Preparar histórico
        const history: Message[] = test.history.map((m, i) => ({
          id: `msg-${i}`,
          conversationId: 'test-conv',
          type: 'text',
          text: m.text,
          fromMe: m.fromMe,
          isFromAgent: m.isFromAgent || false,
          timestamp: new Date(Date.now() - (10000 * (test.history.length - i))),
          status: 'read',
          createdAt: new Date(),
          updatedAt: new Date()
        }));

        // Executar IA
        process.stdout.write("   🤖 Gerando resposta... ");
        const result = await generateAIResponse(
          USER_ID,
          history,
          test.newMessage,
          {
            contactName: 'Cliente Teste',
            sentMedias: []
          }
        );
        
        const response = result?.text || "null";
        
        console.log("OK");
        console.log(`   📩 Resposta: "${response}"`);

        // Verificações
        let passed = true;
        const responseLower = response.toLowerCase();

        // Check proibidos
        if (test.shouldNotContain) {
          for (const forbidden of test.shouldNotContain) {
            if (responseLower.includes(forbidden.toLowerCase())) {
              console.log(`   ❌ FALHOU: Contém texto proibido: "${forbidden}"`);
              passed = false;
            }
          }
        }

        // Check obrigatórios (pelo menos um)
        if (test.shouldContain) {
            const found = test.shouldContain.some(term => responseLower.includes(term.toLowerCase()));
            if (!found) {
                console.log(`   ❌ FALHOU: Não contém nenhum dos termos esperados: ${test.shouldContain.join(', ')}`);
                passed = false;
            }
        }

        if (passed) {
            console.log("   ✅ PASSOU");
        }
      }
    }

  } catch (error) {
    console.error("❌ Erro durante os testes:", error);
  } finally {
    // 3. Restaurar prompt original
    console.log("\n\n🔄 Restaurando prompt original...");
    await db.update(aiAgentConfig)
      .set({ prompt: originalPrompt })
      .where(eq(aiAgentConfig.userId, USER_ID));
    console.log("✅ Prompt original restaurado.");
    process.exit(0);
  }
}

runTests();
