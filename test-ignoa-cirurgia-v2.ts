/**
 * 🧪 TESTE IGNOA - DIFERENCIAÇÃO CURSOS DE CIRURGIA
 * 
 * Este script testa se o agente da IGNOA diferencia corretamente:
 * 1. Aperfeiçoamento em Cirurgia Oral (12 meses, R$ 500/mês)
 * 2. Especialização em Bucomaxilofacial (24 meses, R$ 2.800+)
 * 
 * Uso: npx tsx test-ignoa-cirurgia-v2.ts
 */

import 'dotenv/config';
import { Mistral } from "@mistralai/mistralai";

// User ID do IGNOA
const IGNOA_USER_ID = '9833fb4b-c51a-44ee-8618-8ddd6a999bb3';

// Prompt do agente IGNOA (atualizado)
const IGNOA_PROMPT = `Você é a Rita, secretária virtual do Instituto IGNOA/FACOP em Campina Grande-PB.

# SUA IDENTIDADE
- Nome: Rita
- Função: Secretária Virtual
- Instituição: IGNOA/FACOP - Instituto Gama de Núcleo em Odontologia Avançada
- Local: Travessa Vigário Calixto, 723, Catolé (ao lado do Shopping Luiza Mota) - Campina Grande/PB
- Contato: (83) 99155-0937
- Site: www.ignoa.com.br

# SE FOR CURSO DE PÓS-GRADUAÇÃO
Oferecemos especializações para dentistas:

📚 *CURSOS DISPONÍVEIS:*

6. *ESPECIALIZAÇÃO EM CIRURGIA BUCOMAXILOFACIAL* (24 meses)
   - Tipo: ESPECIALIZAÇÃO (curso completo e mais avançado)
   - Duração: 24 meses
   - Investimento: Matrícula R$ 500,00 + 36x R$ 2.800,00 ou 50x R$ 2.016,00
   - Horário: Sextas e Sábados (09:00 às 18:00) – Mensal
   - Coordenação: Prof. Roberto Gama de Oliveira e equipe
   - QUANDO FALAR DESTE CURSO: Use [MEDIA:IMG_BUCOMAXILOFACIAL]

7. *APERFEIÇOAMENTO EM CIRURGIA ORAL* (12 meses) - NOVO!
   - Tipo: APERFEIÇOAMENTO (curso menor, mais acessível)
   - Tripla certificação em: Imersão em Suturas + Imersão em Técnicas Anestésicas
   - Turma 01 - Em Campina Grande
   - Duração: 12 meses
   - Periodicidade: 01 encontro mensal (Sábado: Manhã e Tarde / Domingo: Manhã e Tarde)
   - Curso voltado para PRÁTICA CLÍNICA
   - Coordenação: Dra. Andreza Macedo
   - Investimento: *12x de R$ 500,00* (R$ 500/mês)
   - Local: Travessa Vigário Calixto, 723, Catolé (Ao lado do Shopping Luiza Mota)
   - QUANDO FALAR DESTE CURSO: Use [MEDIA:IMG_CIRURGIA_ORAL]

# ⚠️ IMPORTANTE: DIFERENÇA ENTRE CURSOS DE CIRURGIA

Quando o cliente perguntar sobre "cirurgia", "cirurgia oral", "curso de cirurgia" ou termos semelhantes, SEMPRE pergunte qual opção interessa:

"Temos duas opções na área de cirurgia! 🦷

📌 *APERFEIÇOAMENTO EM CIRURGIA ORAL* (12 meses)
   - Curso menor e mais acessível
   - Duração: 12 meses
   - Valor: *12x de R$ 500,00*
   - Foco em prática clínica
   - Coordenação: Dra. Andreza Macedo

📌 *ESPECIALIZAÇÃO EM CIRURGIA BUCOMAXILOFACIAL* (24 meses)
   - Especialização completa e mais avançada
   - Duração: 24 meses  
   - Valor: Matrícula R$ 500 + 36x R$ 2.800 ou 50x R$ 2.016
   - Coordenação: Prof. Roberto Gama

Qual das duas te interessa mais? 😊"

# REGRAS DE MÍDIA
- Bucomaxilofacial (Especialização) → [MEDIA:IMG_BUCOMAXILOFACIAL]
- Cirurgia Oral (Aperfeiçoamento) → [MEDIA:IMG_CIRURGIA_ORAL]`;

// Cenários de teste
const TEST_SCENARIOS = [
  {
    name: "Pergunta genérica sobre cirurgia",
    messages: ["oi", "cursos", "quero saber sobre o curso de cirurgia oral"],
    expectedChecks: {
      presentsBothOptions: true,
      asksWhichOption: true
    }
  },
  {
    name: "Reprodução do print (caso real)",
    messages: ["boa noite!!", "gostaria de saber se já iniciou o curso de aperfeiçoamento em cirurgia oral?", "e valor?"],
    expectedChecks: {
      mentionsAperfeicoamento: true,
      correctPrice500: true
    }
  },
  {
    name: "Interesse na Especialização",
    messages: ["oi", "quero a especialização em bucomaxilofacial"],
    expectedChecks: {
      mentionsBucomaxilo: true,
      correctPrice2800: true
    }
  }
];

// Verificações
const CHECKS = {
  presentsBothOptions: (text: string) => {
    const hasAperfeicoamento = /aperfeic?oamento|12 meses|500.*mês|500\/mês|cirurgia oral.*12/i.test(text);
    const hasBucomaxilo = /bucomaxilo|especializa[çc][aã]o|24 meses|2\.?800/i.test(text);
    return hasAperfeicoamento && hasBucomaxilo;
  },
  asksWhichOption: (text: string) => /qual.*interessa|qual.*prefere|qual.*das duas/i.test(text),
  mentionsAperfeicoamento: (text: string) => /aperfeic?oamento|12 meses|andreza/i.test(text),
  correctPrice500: (text: string) => /500/i.test(text),
  mentionsBucomaxilo: (text: string) => /bucomaxilo|24 meses/i.test(text),
  correctPrice2800: (text: string) => /2\.?800|2\.?016/i.test(text),
  hasMediaTag: (text: string) => /\[MEDIA:/i.test(text)
};

async function testWithMistral() {
  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  🦷 TESTE IGNOA - DIFERENCIAÇÃO CURSOS DE CIRURGIA                   ║
║                                                                      ║
║  Testando se o agente diferencia:                                    ║
║  • Aperfeiçoamento em Cirurgia Oral (12 meses, R$ 500/mês)          ║
║  • Especialização em Bucomaxilofacial (24 meses, R$ 2.800+)         ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  const results: Array<{scenario: string, passed: boolean, issues: string[]}> = [];

  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 ${scenario.name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    const conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];
    let lastResponse = '';
    const issues: string[] = [];
    
    for (const msg of scenario.messages) {
      console.log(`\n👤 Cliente: ${msg}`);
      conversationHistory.push({ role: 'user', content: msg });
      
      try {
        const response = await mistral.chat.complete({
          model: "mistral-large-latest",
          messages: [
            { role: "system", content: IGNOA_PROMPT },
            ...conversationHistory
          ],
          temperature: 0.7,
          maxTokens: 500
        });
        
        lastResponse = (response.choices?.[0]?.message?.content as string) || '';
        console.log(`🤖 Agente: ${lastResponse.substring(0, 400)}${lastResponse.length > 400 ? '...' : ''}`);
        
        conversationHistory.push({ role: 'assistant', content: lastResponse });
        
        // Verificar se enviou mídia
        if (CHECKS.hasMediaTag(lastResponse)) {
          console.log(`   📸 Mídia detectada: ${lastResponse.match(/\[MEDIA:[^\]]+\]/g)?.join(', ')}`);
        }
        
      } catch (error: any) {
        console.log(`   ❌ Erro: ${error.message}`);
        lastResponse = '';
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Verificar checks esperados
    console.log(`\n📊 Verificações:`);
    for (const [checkName, expected] of Object.entries(scenario.expectedChecks)) {
      const checkFn = CHECKS[checkName as keyof typeof CHECKS];
      if (checkFn) {
        const passed = checkFn(lastResponse);
        if (passed === expected) {
          console.log(`   ✅ ${checkName}`);
        } else {
          console.log(`   ❌ ${checkName} (esperado: ${expected}, obtido: ${passed})`);
          issues.push(checkName);
        }
      }
    }
    
    results.push({
      scenario: scenario.name,
      passed: issues.length === 0,
      issues
    });
  }

  // Relatório final
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                        📊 RELATÓRIO FINAL                            ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  let passedCount = 0;
  for (const result of results) {
    const status = result.passed ? '✅ PASSOU' : '❌ FALHOU';
    console.log(`${status} - ${result.scenario}`);
    if (!result.passed) {
      console.log(`   Problemas: ${result.issues.join(', ')}`);
    }
    if (result.passed) passedCount++;
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 RESULTADO: ${passedCount}/${results.length} cenários passaram
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  if (passedCount === results.length) {
    console.log('🎉 TODOS OS TESTES PASSARAM! O agente diferencia corretamente os cursos de cirurgia.');
  } else {
    console.log('⚠️ Alguns testes falharam. O prompt foi atualizado - rode novamente para validar.');
  }
}

// Executar
testWithMistral().catch(console.error);
