/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧪 TESTE REAL: Cliente IA fazendo pedidos → Editor IA aplicando mudanças
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Este teste simula um cliente real:
 * 1. Um prompt inicial de um agente de vendas
 * 2. Vários pedidos em linguagem natural (como um cliente faria)
 * 3. A IA (Mistral) decide onde e o que alterar
 * 4. Verificamos se as alterações foram aplicadas corretamente
 */

import { editarPromptViaIA } from './server/promptEditService';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";

// Prompt inicial de um agente de vendas (simulando cenário real)
const PROMPT_INICIAL = `# Agente de Vendas - Loja TechMax

## Identidade
Você é o Carlos, assistente virtual da TechMax.
Seu tom é profissional e educado.

## Saudação
Olá! Bem-vindo à TechMax. Como posso ajudar você hoje?

## Produtos
- iPhone 15 Pro: R$ 8.999
- Samsung Galaxy S24: R$ 6.499
- MacBook Air M3: R$ 12.999

## Horário de Atendimento
Atendemos de segunda a sexta, das 9h às 18h.

## Contato
WhatsApp: (11) 99999-1234
Email: contato@techmax.com.br

## Finalização
Obrigado por entrar em contato! Volte sempre.`;

// Cenários de teste (pedidos reais que um cliente faria)
const CENARIOS = [
  {
    id: 1,
    pedido: "Mude o nome do atendente para Roberto",
    verificacao: (p: string) => p.includes("Roberto") && !p.includes("Carlos"),
    esperado: "Nome mudado de Carlos para Roberto"
  },
  {
    id: 2,
    pedido: "O preço do iPhone subiu para R$ 9.499",
    verificacao: (p: string) => p.includes("9.499") || p.includes("9499"),
    esperado: "Preço do iPhone atualizado"
  },
  {
    id: 3,
    pedido: "Quero um tom mais descontraído e jovem, use emojis",
    verificacao: (p: string) => {
      // Verifica se tem pelo menos um emoji
      const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(p);
      // Ou palavras mais informais
      const hasInformal = /(e aí|opa|beleza|show|top)/i.test(p);
      return hasEmoji || hasInformal;
    },
    esperado: "Tom mais descontraído com emojis"
  },
  {
    id: 4,
    pedido: "Adicione que temos parcelamento em até 12x sem juros",
    verificacao: (p: string) => p.toLowerCase().includes("12x") || p.toLowerCase().includes("parcel"),
    esperado: "Informação de parcelamento adicionada"
  },
  {
    id: 5,
    pedido: "Remova a parte de email, só atendemos por WhatsApp",
    verificacao: (p: string) => !p.includes("contato@techmax.com.br"),
    esperado: "Email removido"
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// EXECUÇÃO DO TESTE
// ═══════════════════════════════════════════════════════════════════════════

async function executarTeste() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE REAL: Cliente IA → Editor IA (Mistral)");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  console.log("📄 PROMPT INICIAL:");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(PROMPT_INICIAL);
  console.log("─────────────────────────────────────────────────────────────\n");
  
  let promptAtual = PROMPT_INICIAL;
  let sucessos = 0;
  let falhas = 0;
  const historicoChatSimulado: { role: string; content: string }[] = [];
  
  for (const cenario of CENARIOS) {
    console.log(`\n🎯 CENÁRIO ${cenario.id}: ${cenario.esperado}`);
    console.log(`💬 Cliente diz: "${cenario.pedido}"`);
    
    // Adiciona ao histórico de chat (como seria em produção)
    historicoChatSimulado.push({
      role: "user",
      content: cenario.pedido
    });
    
    try {
      // Chama a IA para editar
      const resultado = await editarPromptViaIA(
        promptAtual,
        cenario.pedido,
        MISTRAL_API_KEY,
        "mistral"
      );
      
      // Adiciona resposta da IA ao histórico
      historicoChatSimulado.push({
        role: "assistant",
        content: resultado.mensagemChat
      });
      
      console.log(`🤖 IA responde: "${resultado.mensagemChat}"`);
      console.log(`📊 Edições: ${resultado.edicoesAplicadas} aplicadas, ${resultado.edicoesFalharam} falharam`);
      
      if (resultado.detalhes.length > 0) {
        console.log("📝 Detalhes das edições:");
        for (const detalhe of resultado.detalhes) {
          const status = detalhe.status === "aplicada" ? "✅" : "❌";
          const matchInfo = detalhe.matchType ? ` (${detalhe.matchType})` : "";
          console.log(`   ${status} "${detalhe.buscar.substring(0, 40)}..." → "${detalhe.substituir.substring(0, 40)}..."${matchInfo}`);
        }
      }
      
      // Verifica se a edição funcionou
      const passou = cenario.verificacao(resultado.novoPrompt);
      
      if (passou) {
        console.log("✅ PASSOU - Verificação confirmou a alteração");
        promptAtual = resultado.novoPrompt;
        sucessos++;
      } else {
        console.log("❌ FALHOU - Verificação não encontrou a alteração esperada");
        // Mesmo se falhou a verificação, atualiza o prompt se houve edições
        if (resultado.success) {
          promptAtual = resultado.novoPrompt;
        }
        falhas++;
      }
      
    } catch (error: any) {
      console.log(`❌ ERRO: ${error.message}`);
      falhas++;
    }
    
    // Pequena pausa para não sobrecarregar a API
    await new Promise(r => setTimeout(r, 1500));
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // RESULTADO FINAL
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📊 RESULTADO FINAL");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`✅ Sucessos: ${sucessos}/${CENARIOS.length}`);
  console.log(`❌ Falhas: ${falhas}/${CENARIOS.length}`);
  console.log(`📈 Taxa de Sucesso: ${Math.round((sucessos / CENARIOS.length) * 100)}%`);
  
  console.log("\n📄 PROMPT FINAL (após todas as edições):");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(promptAtual);
  console.log("─────────────────────────────────────────────────────────────");
  
  console.log("\n💬 HISTÓRICO DE CHAT (como seria mostrado ao usuário):");
  console.log("─────────────────────────────────────────────────────────────");
  for (const msg of historicoChatSimulado) {
    const emoji = msg.role === "user" ? "👤" : "🤖";
    console.log(`${emoji} ${msg.role === "user" ? "Você" : "Assistente"}: ${msg.content}`);
  }
  console.log("─────────────────────────────────────────────────────────────");
  
  // Retorna código de saída
  if (falhas > 0) {
    console.log("\n⚠️  Alguns cenários falharam. Revise os logs acima.");
    process.exit(1);
  } else {
    console.log("\n🎉 Todos os cenários passaram! Sistema funcionando corretamente.");
    process.exit(0);
  }
}

// Executa o teste
executarTeste().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
