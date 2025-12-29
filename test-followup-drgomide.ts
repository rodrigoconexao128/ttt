/**
 * TESTE ESPECÍFICO - CENÁRIO DRGOMIDE (Screenshot do usuário)
 * 
 * Testa o cenário exato onde o cliente reclamou de repetição
 */

import { Mistral } from "@mistralai/mistralai";
import * as dotenv from 'dotenv';

dotenv.config();

const mistralClient = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY
});

// Cenário exato do screenshot
const drgomideScenario = {
  business: "Consultoria de Automação WhatsApp",
  companyName: "AgenteZap",
  agentName: "Rodrigo",
  agentRole: "Consultor de Vendas",
  products: [
    { name: "Plano Básico", description: "1 atendente, 500 msgs/mês", price: "R$ 97/mês" },
    { name: "Plano Pro", description: "Ilimitado + follow-up automático", price: "R$ 197/mês" }
  ],
  // Conversa exata do screenshot
  conversations: [
    // Cenário 1: Cliente diz "Vc apenas repetiu"
    {
      name: "Repetição detectada pelo cliente",
      messages: [
        { from: "CLIENTE", text: "Sou consultor de psicologia e quero automatizar meu WhatsApp" },
        { from: "NÓS", text: "Perfeito, drgomide! Funciona assim: a IA responde seus leads 24h automaticamente. Quer uma demonstração rápida?" },
        { from: "CLIENTE", text: "Sim quero" },
        { from: "NÓS", text: "Perfeito, drgomide! Funciona assim: a IA responde seus leads 24h automaticamente. Quer uma demonstração rápida?" },
        { from: "CLIENTE", text: "Vc apenas repetiu" }
      ],
      expectedBehavior: "Pedir desculpas e mudar abordagem completamente"
    },
    // Cenário 2: Cliente reclama que não leu
    {
      name: "Cliente reclama que IA não leu",
      messages: [
        { from: "CLIENTE", text: "Trabalho com consultoria psicológica, atendo pacientes particulares" },
        { from: "NÓS", text: "Entendi! Nosso sistema responde seus leads automaticamente 24h" },
        { from: "CLIENTE", text: "Mas eu não tenho leads, são pacientes que já me conhecem" },
        { from: "NÓS", text: "Perfeito! Podemos automatizar seu atendimento. Quer uma demonstração?" },
        { from: "CLIENTE", text: "Vc está fazendo a pergunta sem ler o que escrevi" }
      ],
      expectedBehavior: "Reconhecer o erro, reler o contexto e responder especificamente sobre PACIENTES"
    },
    // Cenário 3: Cliente já disse o que quer
    {
      name: "Cliente já explicou necessidade",
      messages: [
        { from: "CLIENTE", text: "Preciso que o sistema envie lembretes de consulta para meus pacientes" },
        { from: "NÓS", text: "Nosso sistema pode fazer isso! Temos planos a partir de R$ 97/mês" },
        { from: "CLIENTE", text: "E como funciona o lembrete?" },
        { from: "NÓS", text: "É muito simples! A IA envia automaticamente. Quer uma demonstração?" }
      ],
      expectedBehavior: "Explicar COMO funciona o lembrete, não oferecer demonstração novamente"
    },
    // Cenário 4: Cliente pediu algo específico
    {
      name: "Cliente pediu info específica",
      messages: [
        { from: "CLIENTE", text: "Quero saber o preço do plano com follow-up" },
        { from: "NÓS", text: "O Plano Pro custa R$ 197/mês e inclui follow-up automático!" },
        { from: "CLIENTE", text: "E posso testar antes de pagar?" }
      ],
      expectedBehavior: "Responder sobre TESTE/TRIAL, não repetir o preço"
    },
    // Cenário 5: Cliente mencionou limitação
    {
      name: "Cliente tem limitação",
      messages: [
        { from: "CLIENTE", text: "Interessante, mas sou bem leigo em tecnologia" },
        { from: "NÓS", text: "Não se preocupe! O sistema é super fácil de usar, plug and play" },
        { from: "CLIENTE", text: "Mas como faço pra configurar?" }
      ],
      expectedBehavior: "Explicar que há SUPORTE ou que a equipe configura para ele"
    }
  ]
};

async function testScenario(scenario: typeof drgomideScenario.conversations[0], index: number) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 CENÁRIO ${index + 1}/5: ${scenario.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📝 Expectativa: ${scenario.expectedBehavior}`);
  console.log(`\n📜 Conversa:`);
  scenario.messages.forEach((msg) => {
    console.log(`   ${msg.from === 'NÓS' ? '➡️' : '⬅️'} ${msg.from}: ${msg.text}`);
  });
  
  const now = new Date();
  const brazilNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const todayStr = brazilNow.toLocaleDateString('pt-BR');
  const dayOfWeek = brazilNow.getDay();
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const todayName = dayNames[dayOfWeek];
  
  const lastClientMessage = [...scenario.messages].reverse().find(m => m.from === 'CLIENTE');
  const ourLastMessages = scenario.messages.filter(m => m.from === 'NÓS').slice(-3).map(m => m.text);
  
  const hasNegativeFeedback = scenario.messages.some(m => 
    m.from === 'CLIENTE' && 
    (m.text.toLowerCase().includes('repetiu') || 
     m.text.toLowerCase().includes('sem ler') ||
     m.text.toLowerCase().includes('não leu') ||
     m.text.toLowerCase().includes('já disse'))
  );
  
  const productsList = drgomideScenario.products.map(p => `- ${p.name}: ${p.description} (${p.price})`).join('\n');
  
  const historyFormatted = scenario.messages.map(m => {
    return `${m.from}: ${m.text}`;
  }).join('\n');
  
  const prompt = `Você é um vendedor HUMANO experiente fazendo follow-up via WhatsApp.
Sua tarefa é ANALISAR a conversa e decidir a MELHOR ação.

## DATA E HORA ATUAL
- Hoje: ${todayStr} (${todayName})
- Hora atual: ${brazilNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

## SOBRE O NEGÓCIO
- Empresa: ${drgomideScenario.companyName}
- Agente: ${drgomideScenario.agentName}
- Cargo: ${drgomideScenario.agentRole}

## PRODUTOS/SERVIÇOS
${productsList}

## DADOS DO CLIENTE
- Nome: drgomide (consultor de psicologia)
- Estágio follow-up: 2
${hasNegativeFeedback ? '\n⚠️ ATENÇÃO CRÍTICA: Cliente reclamou de repetição ou falta de leitura! VOCÊ PRECISA MUDAR A ABORDAGEM!' : ''}

## CONFIGURAÇÕES
- Tom: consultivo e prestativo
- Emojis: máximo 1 por mensagem

## HISTÓRICO COMPLETO DA CONVERSA (LEIA CADA MENSAGEM COM MUITA ATENÇÃO!)
${historyFormatted}

## ÚLTIMAS MENSAGENS QUE JÁ ENVIAMOS (NÃO REPETIR ABSOLUTAMENTE NADA SIMILAR!)
${ourLastMessages.map((m, i) => `${i+1}. "${m}"`).join('\n')}

## ÚLTIMA MENSAGEM DO CLIENTE (VOCÊ DEVE RESPONDER DIRETAMENTE A ISSO!)
"${lastClientMessage?.text || ''}"

## REGRAS CRÍTICAS - LEIA ANTES DE RESPONDER!
1. ❌ NUNCA repita a mesma pergunta ou frase que já enviamos
2. ❌ NUNCA ignore o que o cliente disse - sua mensagem DEVE ser uma continuação natural
3. ❌ NUNCA use colchetes [], barras / ou marcadores técnicos
4. ❌ NUNCA termine mensagem com a palavra "Áudio"
5. ❌ NUNCA use o nome "Rodrigo" na mensagem - use "drgomide" se necessário
6. ✅ SEMPRE leia e responda ao último comentário do cliente DIRETAMENTE
7. ✅ SEMPRE agregue NOVO valor (info nova, benefício novo, pergunta diferente)
8. ✅ SEMPRE escreva mensagem PRONTA para enviar (texto final completo)
9. ✅ Se o cliente reclamou de repetição, peça DESCULPAS SINCERAS e mude TOTALMENTE a abordagem

## ANÁLISE OBRIGATÓRIA ANTES DE RESPONDER
Antes de gerar a mensagem, você DEVE analisar:
1. O que o cliente REALMENTE quer/precisa?
2. O que já foi explicado/oferecido?
3. Qual informação NOVA eu posso agregar?
4. A mensagem que vou gerar é DIFERENTE das anteriores?

## DECISÃO
- ABORT: cliente recusou claramente, disse não ter interesse
- WAIT: nossa última msg foi há menos de 2h OU cliente pediu pra esperar
- SEND: podemos agregar NOVO valor respondendo diretamente ao cliente

## FORMATO DA RESPOSTA (JSON válido, sem texto extra)
{"action":"send|wait|abort","reason":"motivo curto","message":"mensagem PRONTA que responde DIRETAMENTE ao cliente"}`;

  try {
    const response = await mistralClient.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    });
    
    const rawContent = response.choices?.[0]?.message?.content || "";
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    console.log(`\n🤖 Resposta bruta da IA:`);
    console.log(jsonStr);
    
    const parsed = JSON.parse(jsonStr);
    
    console.log(`\n✅ Resultado parseado:`);
    console.log(`   Action: ${parsed.action}`);
    console.log(`   Reason: ${parsed.reason}`);
    if (parsed.message) {
      console.log(`   Message: "${parsed.message}"`);
    }
    
    // Validações rigorosas
    const issues: string[] = [];
    
    if (parsed.message) {
      const msg = parsed.message.toLowerCase();
      
      // Check for repetition (mais rigoroso)
      for (const prev of ourLastMessages) {
        const prevLower = prev.toLowerCase();
        
        // Check exact phrases
        if (prevLower.includes('quer uma demonstração') && msg.includes('quer uma demonstração')) {
          issues.push("❌ REPETIU: 'Quer uma demonstração?'");
        }
        if (prevLower.includes('funciona assim') && msg.includes('funciona assim')) {
          issues.push("❌ REPETIU: 'Funciona assim'");
        }
        if (prevLower.includes('24h automaticamente') && msg.includes('24h automaticamente')) {
          issues.push("❌ REPETIU: '24h automaticamente'");
        }
        
        // Check similarity
        const similarity = calculateSimilarity(msg, prevLower);
        if (similarity > 0.5) {
          issues.push(`❌ SIMILARIDADE ${(similarity * 100).toFixed(0)}% com: "${prev.substring(0, 50)}..."`);
        }
      }
      
      // Check for "Áudio" at end
      if (/\s*[ÁáAa]udio\s*$/i.test(parsed.message)) {
        issues.push("❌ Contém 'Áudio' no final");
      }
      
      // Check for brackets
      if (/\[.*?\]/.test(parsed.message)) {
        issues.push("❌ Contém colchetes []");
      }
      
      // Check if apologizes when needed
      const lastClientLower = (lastClientMessage?.text || '').toLowerCase();
      if ((lastClientLower.includes('repetiu') || lastClientLower.includes('sem ler')) && 
          !msg.includes('desculp') && !msg.includes('perdão') && !msg.includes('peço')) {
        issues.push("❌ Cliente reclamou mas NÃO PEDIU DESCULPAS");
      }
      
      // Check if responds to the actual question
      if (lastClientLower.includes('como') && !msg.includes('como') && msg.includes('quer')) {
        issues.push("❌ Cliente perguntou COMO, mas ofereceu demonstração ao invés de explicar");
      }
    }
    
    if (issues.length > 0) {
      console.log(`\n⚠️ PROBLEMAS ENCONTRADOS:`);
      issues.forEach(i => console.log(`   ${i}`));
      return { passed: false, issues };
    } else {
      console.log(`\n✅ CENÁRIO PASSOU!`);
      return { passed: true, issues: [] };
    }
    
  } catch (e: any) {
    console.log(`\n❌ ERRO: ${e.message}`);
    return { passed: false, issues: [`Erro: ${e.message}`] };
  }
}

function calculateSimilarity(text1: string, text2: string): number {
  const words1 = text1.split(/\s+/);
  const words2 = text2.split(/\s+/);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matches = 0;
  for (const word of words1) {
    if (word.length > 3 && words2.includes(word)) matches++;
  }
  
  return matches / Math.max(words1.length, words2.length);
}

async function runAllTests() {
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`#  TESTE ESPECÍFICO - CENÁRIO DRGOMIDE (Screenshot do usuário)`);
  console.log(`#  Data: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`${'#'.repeat(80)}`);
  
  const results: Array<{ name: string; passed: boolean; issues: string[] }> = [];
  
  for (let i = 0; i < drgomideScenario.conversations.length; i++) {
    const result = await testScenario(drgomideScenario.conversations[i], i);
    results.push({
      name: drgomideScenario.conversations[i].name,
      passed: result.passed,
      issues: result.issues
    });
    
    // Delay entre testes
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // Resumo final
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`#  RESUMO FINAL - CENÁRIO DRGOMIDE`);
  console.log(`${'#'.repeat(80)}`);
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n✅ Passou: ${passed}/5`);
  console.log(`❌ Falhou: ${failed}/5`);
  console.log(`📊 Taxa de sucesso: ${(passed / 5 * 100).toFixed(0)}%`);
  
  if (failed > 0) {
    console.log(`\n❌ Cenários que falharam:`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}:`);
      r.issues.forEach(i => console.log(`      ${i}`));
    });
  }
  
  if (passed === 5) {
    console.log(`\n🎉 PERFEITO! Todos os 5 cenários passaram!`);
  } else if (passed >= 4) {
    console.log(`\n✨ MUITO BOM! ${passed}/5 cenários passaram.`);
  } else {
    console.log(`\n⚠️ PRECISA MELHORAR. Apenas ${passed}/5 cenários passaram.`);
  }
}

runAllTests().catch(console.error);
