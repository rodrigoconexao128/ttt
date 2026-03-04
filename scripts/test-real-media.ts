/**
 * TESTE REALISTA DO ADMIN AGENT SERVICE
 * 
 * Este teste usa o serviço real do adminAgentService (não uma simulação)
 * para verificar se as mídias estão sendo enviadas corretamente.
 */

import { processAdminMessage, AdminAgentResponse } from '../server/adminAgentService';

interface TestResult {
  testName: string;
  passed: boolean;
  issue: string;
  response: string;
  hasMedia: boolean;
  mediaName: string | null;
}

const PHONE_NUMBER = "5511999887766"; // Telefone fake para teste

async function testConversation(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE REALISTA - ADMIN AGENT SERVICE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const results: TestResult[] = [];

  // Cenários de teste
  const testCases = [
    {
      name: "Pergunta 'como funciona'",
      message: "como funciona o sistema de vcs?",
      expectMedia: true,
      expectedMediaName: "COMO_FUNCIONA",
    },
    {
      name: "Pergunta 'quero saber mais'",
      message: "quero saber mais sobre o sistema",
      expectMedia: true,
      expectedMediaName: "COMO_FUNCIONA",
    },
    {
      name: "Pergunta 'quanto custa'",
      message: "quanto custa?",
      expectMedia: true,
      expectedMediaName: "TABELA_PRECOS",
    },
    {
      name: "Pergunta 'me mostra o contrato'",
      message: "me mostra o contrato",
      expectMedia: true,
      expectedMediaName: "PDF_CONTRATO",
    },
    {
      name: "Saudação simples - não deve ter mídia",
      message: "oi",
      expectMedia: false,
      expectedMediaName: null,
    },
  ];

  for (const testCase of testCases) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🧪 Teste: ${testCase.name}`);
    console.log(`📤 Mensagem: "${testCase.message}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      // Usar número diferente para cada teste evitar histórico
      const testPhone = PHONE_NUMBER + Math.random().toString().slice(2, 6);
      
      const response: AdminAgentResponse = await processAdminMessage(testPhone, testCase.message);
      
      console.log(`\n📥 Resposta: ${response.text.substring(0, 200)}...`);
      
      const hasMedia = response.mediaActions && response.mediaActions.length > 0;
      const mediaName = hasMedia ? response.mediaActions![0].media_name : null;

      console.log(`\n📊 Mídia: ${hasMedia ? `✅ SIM (${mediaName})` : '❌ NÃO'}`);

      let passed = true;
      let issue = "";

      if (testCase.expectMedia && !hasMedia) {
        passed = false;
        issue = `DEVERIA ter mídia [ENVIAR_MIDIA:${testCase.expectedMediaName}] mas não tem!`;
      } else if (testCase.expectMedia && mediaName !== testCase.expectedMediaName) {
        passed = false;
        issue = `Mídia errada: esperava ${testCase.expectedMediaName}, recebeu ${mediaName}`;
      } else if (!testCase.expectMedia && hasMedia) {
        passed = false;
        issue = `NÃO deveria ter mídia, mas tem [ENVIAR_MIDIA:${mediaName}]`;
      }

      results.push({
        testName: testCase.name,
        passed,
        issue,
        response: response.text,
        hasMedia: !!hasMedia,
        mediaName,
      });

      if (passed) {
        console.log(`\n✅ PASSOU`);
      } else {
        console.log(`\n❌ FALHOU: ${issue}`);
      }

    } catch (error) {
      results.push({
        testName: testCase.name,
        passed: false,
        issue: `Erro: ${error}`,
        response: "",
        hasMedia: false,
        mediaName: null,
      });
      console.log(`\n❌ ERRO: ${error}`);
    }

    // Delay entre testes
    await new Promise(r => setTimeout(r, 2000));
  }

  // Resumo
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📊 RESUMO DOS TESTES");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`✅ Passou: ${passed}/${results.length}`);
  console.log(`❌ Falhou: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log("\n🔴 TESTES QUE FALHARAM:");
    results.filter(r => !r.passed).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.testName}`);
      console.log(`     ${r.issue}`);
    });
  }

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

// Executar
testConversation().catch(console.error);
