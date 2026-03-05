/**
 * TESTE DE FOLLOW-UP INTELIGENTE - 10 TIPOS DE NEGÓCIOS
 * 
 * Este teste verifica se o sistema de follow-up:
 * 1. Lê o contexto da conversa corretamente
 * 2. Não repete mensagens
 * 3. Continua a conversa de forma natural
 * 4. Não inclui "Áudio" ou colchetes na mensagem
 */

import { Mistral } from "@mistralai/mistralai";
import * as dotenv from 'dotenv';

dotenv.config();

const mistralClient = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY
});

// 10 cenários de negócios diferentes para teste
const testScenarios = [
  {
    business: "Clínica de Psicologia",
    companyName: "Psicologia Integral",
    agentName: "Dr. Carlos",
    agentRole: "Psicólogo Clínico",
    products: [
      { name: "Terapia Individual", description: "Sessões de 50 min", price: "R$ 200" },
      { name: "Terapia de Casal", description: "Sessões de 1h30", price: "R$ 350" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Oi, vocês atendem por convênio?" },
      { from: "NÓS", text: "Olá! Atendemos sim. Qual seu convênio?" },
      { from: "CLIENTE", text: "Bradesco Saúde" },
      { from: "NÓS", text: "Perfeito! Bradesco Saúde é aceito. Quer agendar uma sessão?" },
      { from: "CLIENTE", text: "Vou ver minha agenda e te falo" }
    ],
    expectedBehavior: "Perguntar se já viu a agenda, oferecer horários disponíveis"
  },
  {
    business: "Academia de Ginástica",
    companyName: "PowerFit Academia",
    agentName: "Mariana",
    agentRole: "Consultora de Matrículas",
    products: [
      { name: "Plano Mensal", description: "Acesso livre", price: "R$ 99/mês" },
      { name: "Plano Anual", description: "Acesso livre + Personal 1x/mês", price: "R$ 79/mês" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Quanto é o plano mensal?" },
      { from: "NÓS", text: "O plano mensal é R$ 99. Mas o anual sai por R$ 79/mês e inclui 1 aula com personal por mês!" },
      { from: "CLIENTE", text: "Hmm interessante, deixa eu pensar" }
    ],
    expectedBehavior: "Destacar benefício do anual, oferecer visita para conhecer"
  },
  {
    business: "Agência de Marketing Digital",
    companyName: "DigitalBoost",
    agentName: "Lucas",
    agentRole: "Consultor de Vendas",
    products: [
      { name: "Gestão de Redes Sociais", description: "Instagram + Facebook", price: "R$ 1.500/mês" },
      { name: "Tráfego Pago", description: "Google + Meta Ads", price: "R$ 2.000/mês" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Preciso aumentar as vendas do meu e-commerce" },
      { from: "NÓS", text: "Entendi! Trabalhamos com tráfego pago que pode aumentar suas vendas em até 40%. Qual seu nicho?" },
      { from: "CLIENTE", text: "Moda feminina" },
      { from: "NÓS", text: "Ótimo nicho! Temos cases de sucesso em moda. Podemos fazer uma análise gratuita do seu site?" },
      { from: "CLIENTE", text: "Pode ser, mas estou viajando. Na segunda falamos" }
    ],
    expectedBehavior: "DEVE ser SCHEDULE para segunda-feira"
  },
  {
    business: "Restaurante Delivery",
    companyName: "Sabor de Casa",
    agentName: "Ana",
    agentRole: "Atendente",
    products: [
      { name: "Marmitex Tradicional", description: "Arroz, feijão, carne, salada", price: "R$ 18" },
      { name: "Marmitex Executiva", description: "Completa com sobremesa", price: "R$ 25" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Vocês entregam no centro?" },
      { from: "NÓS", text: "Sim! Entregamos no centro. Taxa de R$ 5. Quer ver nosso cardápio?" },
      { from: "CLIENTE", text: "(cliente enviou um áudio)" }
    ],
    expectedBehavior: "Responder sobre o áudio, enviar link do cardápio"
  },
  {
    business: "Escritório de Advocacia",
    companyName: "Mendes & Associados",
    agentName: "Dr. Roberto",
    agentRole: "Advogado Especialista",
    products: [
      { name: "Consultoria Trabalhista", description: "Análise de caso", price: "R$ 300" },
      { name: "Ação Judicial", description: "Representação completa", price: "A combinar" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Fui demitido e não recebi a rescisão correta" },
      { from: "NÓS", text: "Isso é comum infelizmente. Podemos analisar seu caso. Você tem os documentos da demissão?" },
      { from: "CLIENTE", text: "Tenho sim" },
      { from: "NÓS", text: "Ótimo! Pode enviar por aqui ou agendar uma consulta presencial. O que prefere?" }
    ],
    expectedBehavior: "Perguntar se prefere enviar documentos ou agendar, não repetir a pergunta"
  },
  {
    business: "Pet Shop",
    companyName: "Amigo Fiel",
    agentName: "Paula",
    agentRole: "Consultora Pet",
    products: [
      { name: "Banho Completo", description: "Cães pequenos", price: "R$ 50" },
      { name: "Tosa Higiênica", description: "Todas as raças", price: "R$ 30" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Meu cachorro precisa de banho e tosa" },
      { from: "NÓS", text: "Claro! Qual a raça e porte do seu pet?" },
      { from: "CLIENTE", text: "Golden Retriever, grande" },
      { from: "NÓS", text: "Golden! Lindo demais. Para cães grandes, banho + tosa fica R$ 100. Quer agendar?" },
      { from: "CLIENTE", text: "Amanhã vocês atendem?" }
    ],
    expectedBehavior: "DEVE ser SCHEDULE para amanhã ou informar horários disponíveis amanhã"
  },
  {
    business: "Imobiliária",
    companyName: "Nova Casa Imóveis",
    agentName: "Fernando",
    agentRole: "Corretor de Imóveis",
    products: [
      { name: "Apartamento 2 quartos", description: "Centro, 65m²", price: "R$ 280.000" },
      { name: "Casa 3 quartos", description: "Bairro nobre, 150m²", price: "R$ 520.000" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Vi um anúncio de apartamento 2 quartos no centro" },
      { from: "NÓS", text: "Temos sim! É o de 65m² por R$ 280 mil. Aceita financiamento. Quer agendar uma visita?" },
      { from: "CLIENTE", text: "Aceita financiamento Caixa?" },
      { from: "NÓS", text: "Sim, aceita Caixa! O prédio é aprovado. Você já tem carta de crédito aprovada?" },
      { from: "CLIENTE", text: "Ainda não, vou dar entrada semana que vem" }
    ],
    expectedBehavior: "DEVE ser SCHEDULE para semana que vem"
  },
  {
    business: "Escola de Idiomas",
    companyName: "English Now",
    agentName: "Teacher Julia",
    agentRole: "Consultora Pedagógica",
    products: [
      { name: "Curso Regular", description: "2x por semana", price: "R$ 199/mês" },
      { name: "Curso Intensivo", description: "4x por semana", price: "R$ 349/mês" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Quero aprender inglês para trabalho" },
      { from: "NÓS", text: "Ótimo objetivo! Nosso curso Business English é perfeito. Qual seu nível atual?" },
      { from: "CLIENTE", text: "Básico, entendo pouca coisa" },
      { from: "NÓS", text: "Entendi! Fazemos um teste de nivelamento gratuito para personalizar seu aprendizado. Pode vir fazer o teste?" }
    ],
    expectedBehavior: "Perguntar melhor horário para o teste, sem repetir o que já foi dito"
  },
  {
    business: "Clínica Odontológica",
    companyName: "Sorriso Perfeito",
    agentName: "Dra. Carla",
    agentRole: "Dentista",
    products: [
      { name: "Clareamento", description: "A laser, 2 sessões", price: "R$ 800" },
      { name: "Limpeza", description: "Profilaxia completa", price: "R$ 150" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Vc apenas repetiu" },
      { from: "NÓS", text: "Desculpe! Deixa eu ser mais objetivo: nosso clareamento custa R$ 800 em 2 sessões. Quer agendar uma avaliação gratuita?" },
      { from: "CLIENTE", text: "Ok, mas agora estou ocupado" }
    ],
    expectedBehavior: "Perguntar qual melhor horário/dia, mostrar empatia pelo tempo do cliente"
  },
  {
    business: "Consultoria de Automação WhatsApp",
    companyName: "AgenteZap",
    agentName: "Rodrigo",
    agentRole: "Consultor de Vendas",
    products: [
      { name: "Plano Básico", description: "1 atendente, 500 msgs/mês", price: "R$ 97/mês" },
      { name: "Plano Pro", description: "Ilimitado + follow-up automático", price: "R$ 197/mês" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Sou consultor de psicologia e quero automatizar meu WhatsApp" },
      { from: "NÓS", text: "Perfeito! Funciona assim: a IA responde seus leads 24h automaticamente. Quer uma demonstração rápida?" },
      { from: "CLIENTE", text: "Sim quero" },
      { from: "NÓS", text: "Perfeito! Funciona assim: a IA responde seus leads 24h automaticamente. Quer uma demonstração rápida?" },
      { from: "CLIENTE", text: "Vc apenas repetiu" }
    ],
    expectedBehavior: "Pedir DESCULPAS pela repetição e oferecer algo diferente (link, vídeo, etc)"
  }
];

// Função que simula o prompt do sistema melhorado
async function testFollowUp(scenario: typeof testScenarios[0], scenarioIndex: number) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 TESTE ${scenarioIndex + 1}/10: ${scenario.business}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`🏢 Empresa: ${scenario.companyName}`);
  console.log(`👤 Agente: ${scenario.agentName} (${scenario.agentRole})`);
  console.log(`📝 Expectativa: ${scenario.expectedBehavior}`);
  console.log(`\n📜 Conversa:`);
  scenario.conversation.forEach((msg, i) => {
    console.log(`   ${msg.from === 'NÓS' ? '➡️' : '⬅️'} ${msg.from}: ${msg.text}`);
  });
  
  const now = new Date();
  const brazilNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const todayStr = brazilNow.toLocaleDateString('pt-BR');
  const dayOfWeek = brazilNow.getDay();
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const todayName = dayNames[dayOfWeek];
  
  const lastClientMessage = [...scenario.conversation].reverse().find(m => m.from === 'CLIENTE');
  const ourLastMessages = scenario.conversation.filter(m => m.from === 'NÓS').slice(-3).map(m => m.text);
  
  const hasNegativeFeedback = scenario.conversation.some(m => 
    m.from === 'CLIENTE' && 
    (m.text.toLowerCase().includes('repetiu') || 
     m.text.toLowerCase().includes('sem ler') ||
     m.text.toLowerCase().includes('já disse'))
  );
  
  const productsList = scenario.products.map(p => `- ${p.name}: ${p.description} (${p.price})`).join('\n');
  
  const historyFormatted = scenario.conversation.map(m => {
    let content = m.text;
    content = content.replace(/\s*Áudio\s*$/gi, '').trim();
    return `${m.from}: ${content}`;
  }).join('\n');
  
  const prompt = `Você é um vendedor HUMANO experiente fazendo follow-up via WhatsApp.
Sua tarefa é ANALISAR a conversa e decidir a MELHOR ação.

## DATA E HORA ATUAL
- Hoje: ${todayStr} (${todayName})
- Hora atual: ${brazilNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

## SOBRE O NEGÓCIO
- Empresa: ${scenario.companyName}
- Agente: ${scenario.agentName}
- Cargo: ${scenario.agentRole}

## PRODUTOS/SERVIÇOS
${productsList}

## DADOS DO CLIENTE
- Nome: Não informado
- Estágio follow-up: 1
${hasNegativeFeedback ? '\n⚠️ ATENÇÃO: Cliente reclamou de repetição ou falta de leitura!' : ''}

## CONFIGURAÇÕES
- Tom: consultivo e prestativo
- Emojis: máximo 1 por mensagem

## HISTÓRICO COMPLETO DA CONVERSA (LEIA COM ATENÇÃO!)
${historyFormatted}

## ÚLTIMAS MENSAGENS QUE JÁ ENVIAMOS (NÃO REPETIR NADA SIMILAR!)
${ourLastMessages.map((m, i) => `${i+1}. "${m}"`).join('\n')}

## ÚLTIMA MENSAGEM DO CLIENTE (RESPONDER A ISSO!)
"${lastClientMessage?.text || ''}"

## REGRAS CRÍTICAS - LEIA ANTES DE RESPONDER!
1. ❌ NUNCA repita a mesma pergunta ou frase que já enviamos
2. ❌ NUNCA ignore o que o cliente disse - sua mensagem DEVE ser uma continuação natural
3. ❌ NUNCA use colchetes [], barras / ou marcadores técnicos
4. ❌ NUNCA termine mensagem com a palavra "Áudio"
5. ❌ NUNCA use o nome "${scenario.agentName}" - não use nome do cliente
6. ✅ SEMPRE leia e responda ao último comentário do cliente
7. ✅ SEMPRE agregue NOVO valor (info nova, benefício novo, pergunta diferente)
8. ✅ SEMPRE escreva mensagem PRONTA para enviar (texto final completo)
9. ✅ Se o cliente reclamou de repetição, peça DESCULPAS e mude totalmente a abordagem

## DETECÇÃO DE DATA COMBINADA (PRIORIDADE MÁXIMA!)
Se o cliente mencionou um dia para retornar:
- "segunda", "na segunda", "segunda-feira" → SCHEDULE para próxima segunda 09:00
- "terça", "quarta", "quinta", "sexta" → SCHEDULE para o dia correspondente
- "amanhã" → SCHEDULE para amanhã 09:00
- "semana que vem", "próxima semana" → SCHEDULE para segunda que vem 09:00
- "daqui X dias" → SCHEDULE para X dias depois 09:00
- "dia 5", "dia 15" → SCHEDULE para o dia específico

## DECISÃO
- SCHEDULE: cliente combinou uma data específica (use scheduleDate no formato ISO)
- ABORT: cliente recusou claramente, disse não ter interesse, ou comprou
- WAIT: nossa última msg foi há menos de 2h OU cliente pediu pra esperar
- SEND: cliente parou de responder há mais de 2h e podemos agregar NOVO valor

## FORMATO DA RESPOSTA (JSON válido, sem texto extra)
{"action":"send|wait|abort|schedule","reason":"motivo curto","message":"mensagem PRONTA (só se action=send)","scheduleDate":"YYYY-MM-DDTHH:MM:SS (só se action=schedule)"}`;

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
    if (parsed.scheduleDate) {
      console.log(`   ScheduleDate: ${parsed.scheduleDate}`);
    }
    
    // Validações
    const issues: string[] = [];
    
    if (parsed.message) {
      // Check for repetition
      const msg = parsed.message.toLowerCase();
      const isRepetition = ourLastMessages.some(prev => {
        const prevLower = prev.toLowerCase();
        const similarity = calculateSimilarity(msg, prevLower);
        return similarity > 0.5;
      });
      if (isRepetition) {
        issues.push("❌ REPETIÇÃO DETECTADA");
      }
      
      // Check for "Áudio" at end
      if (/\s*Áudio\s*$/i.test(parsed.message)) {
        issues.push("❌ Contém 'Áudio' no final");
      }
      
      // Check for brackets
      if (/\[.*?\]/.test(parsed.message)) {
        issues.push("❌ Contém colchetes []");
      }
      
      // Check for slashes options
      if (/\b\w+\/\w+/.test(parsed.message)) {
        issues.push("❌ Contém opções com barra /");
      }
      
      // Check if responds to client's last message
      const lastClientLower = (lastClientMessage?.text || '').toLowerCase();
      if (lastClientLower.includes('repetiu') && !msg.includes('desculp')) {
        issues.push("❌ Cliente reclamou de repetição mas não pediu desculpas");
      }
    }
    
    // Check schedule detection
    const lastClientText = lastClientMessage?.text?.toLowerCase() || '';
    const shouldSchedule = 
      lastClientText.includes('segunda') ||
      lastClientText.includes('terça') ||
      lastClientText.includes('amanhã') ||
      lastClientText.includes('semana que vem');
    
    if (shouldSchedule && parsed.action !== 'schedule') {
      issues.push("❌ Deveria ser SCHEDULE mas foi " + parsed.action);
    }
    
    if (issues.length > 0) {
      console.log(`\n⚠️ PROBLEMAS ENCONTRADOS:`);
      issues.forEach(i => console.log(`   ${i}`));
      return { passed: false, issues };
    } else {
      console.log(`\n✅ TESTE PASSOU!`);
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
  console.log(`#  TESTE DE FOLLOW-UP INTELIGENTE - 10 TIPOS DE NEGÓCIOS`);
  console.log(`#  Data: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`${'#'.repeat(80)}`);
  
  const results: Array<{ business: string; passed: boolean; issues: string[] }> = [];
  
  for (let i = 0; i < testScenarios.length; i++) {
    const result = await testFollowUp(testScenarios[i], i);
    results.push({
      business: testScenarios[i].business,
      passed: result.passed,
      issues: result.issues
    });
    
    // Delay entre testes para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // Resumo final
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`#  RESUMO FINAL`);
  console.log(`${'#'.repeat(80)}`);
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n✅ Passou: ${passed}/10`);
  console.log(`❌ Falhou: ${failed}/10`);
  console.log(`📊 Taxa de sucesso: ${(passed / 10 * 100).toFixed(0)}%`);
  
  if (failed > 0) {
    console.log(`\n❌ Negócios que falharam:`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.business}:`);
      r.issues.forEach(i => console.log(`      ${i}`));
    });
  }
  
  if (passed === 10) {
    console.log(`\n🎉 PERFEITO! Todos os 10 testes passaram!`);
  } else if (passed >= 8) {
    console.log(`\n✨ MUITO BOM! ${passed}/10 testes passaram.`);
  } else {
    console.log(`\n⚠️ PRECISA MELHORAR. Apenas ${passed}/10 testes passaram.`);
  }
}

runAllTests().catch(console.error);
