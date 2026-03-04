
import { editPrompt } from './server/promptEditEngine';

// Estado inicial
let currentPrompt = `Pizza Express - Assistente Virtual

Oi! Você é muito bem-vindo à Pizza Express! 🍕

## Cardápio
• Pizza Margherita - R$45
• Pizza Calabresa - R$50

## Entrega
Taxa de entrega: R$8.

## Contato
WhatsApp: (11) 99999-8888`;

// Objetivos do Cliente (Simulado)
const goals = [
  {
    step: 1,
    description: "Mudar nome para Luigi's Trattoria",
    instruction: "Mude o nome da pizzaria para Luigi's Trattoria",
    check: (p: string) => p.includes("Luigi's Trattoria") && !p.includes("Pizza Express")
  },
  {
    step: 2,
    description: "Aumentar preço da Margherita",
    instruction: "A pizza Margherita aumentou para R$ 55",
    check: (p: string) => p.includes("R$ 55") || p.includes("R$55")
  },
  {
    step: 3,
    description: "Remover taxa de entrega",
    instruction: "Não cobramos mais taxa de entrega, remova isso",
    check: (p: string) => !p.includes("Taxa de entrega")
  },
  {
    step: 4,
    description: "Adicionar estacionamento",
    instruction: "Adicione que temos estacionamento com manobrista gratuito",
    check: (p: string) => p.toLowerCase().includes("manobrista")
  },
  {
    step: 5,
    description: "Tornar formal",
    instruction: "Quero um tom mais formal, use 'Senhor' e 'Olá'",
    check: (p: string) => p.includes("Olá") && (p.includes("Senhor") || p.includes("senhor")) && !p.includes("Oi!")
  },
  {
    step: 6,
    description: "Correção de detalhe (Fuzzy)",
    instruction: "O telefone mudou para final 9999",
    check: (p: string) => p.includes("9999")
  }
];

async function runSimulation() {
  console.log("🤖 INICIANDO SIMULAÇÃO: CLIENTE IA vs EDITOR DE PROMPT");
  console.log("====================================================");
  console.log("📝 PROMPT INICIAL:");
  console.log(currentPrompt);
  console.log("====================================================\n");

  let totalSuccess = 0;

  for (const goal of goals) {
    console.log(`\n💬 [PASSO ${goal.step}] CLIENTE DIZ: "${goal.instruction}"`);
    
    // Executa a edição
    const result = await editPrompt(currentPrompt, goal.instruction);
    
    // Atualiza o prompt atual
    const previousPrompt = currentPrompt;
    currentPrompt = result.newPrompt;
    
    // Feedback do sistema
    console.log(`⚙️  SISTEMA RESPONDE: ${result.feedbackMessage}`);
    
    // Verificação
    const success = goal.check(currentPrompt);
    
    if (success) {
      console.log("✅ MUDANÇA APLICADA COM SUCESSO");
      totalSuccess++;
    } else {
      console.log("❌ FALHA NA APLICAÇÃO DA MUDANÇA");
      console.log("   Esperado: " + goal.description);
    }
    
    // Mostra as operações realizadas
    if (result.operations.length > 0) {
        console.log("   Operações internas:");
        result.operations.forEach(op => {
            console.log(`   - [${op.type}] ${op.explanation}`);
        });
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log("\n" + "=".repeat(50));
  console.log("📝 PROMPT FINAL APÓS TODAS AS INTERAÇÕES:");
  console.log("=".repeat(50));
  console.log(currentPrompt);
  console.log("=".repeat(50));
  
  console.log(`\n📊 RESULTADO DA SIMULAÇÃO: ${totalSuccess}/${goals.length} passos concluídos com sucesso.`);
  
  if (totalSuccess === goals.length) {
      console.log("🏆 O SISTEMA É PERFEITO! Todas as solicitações foram atendidas.");
  } else {
      console.log("⚠️ O sistema precisa de ajustes em alguns cenários.");
  }
}

runSimulation();
