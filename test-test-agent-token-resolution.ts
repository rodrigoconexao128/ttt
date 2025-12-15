/**
 * TESTE: Simulador deve usar o agente do cliente pelo token
 *
 * Garante que /api/test-agent/message (lógica centralizada) resolve userId via token
 * e NÃO cai no Rodrigo quando existe token válido.
 */

import { handleTestAgentMessage } from "./server/testAgentService";

async function run(): Promise<void> {
  console.log("\n===========================================");
  console.log("🧪 TESTE: SIMULADOR USA AGENTE DO CLIENTE");
  console.log("===========================================\n");

  let passed = 0;
  let failed = 0;

  try {
    const result = await handleTestAgentMessage(
      {
        message: "Oi",
        token: "tok_123",
        history: [],
        // userId propositalmente ausente para simular race do frontend
      },
      {
        getTestToken: async (token) => {
          if (token !== "tok_123") return undefined;
          return { userId: "user_abc", agentName: "Laura", company: "Loja X" };
        },
        getAgentConfig: async (userId) => {
          if (userId !== "user_abc") return undefined;
          return { prompt: "PROMPT_CLIENTE", model: "mistral-small-latest" };
        },
        getMistralClient: async () => {
          return {
            chat: {
              complete: async () => ({
                choices: [{ message: { content: "RESPOSTA_CLIENTE" } }],
              }),
            },
          };
        },
        processAdminMessage: async () => {
          throw new Error("Não deveria cair no Rodrigo");
        },
      }
    );

    if (result.mode === "client_agent" && result.response === "RESPOSTA_CLIENTE" && result.resolvedUserId === "user_abc") {
      console.log("✅ TESTE 1 PASSOU: token resolveu userId e usou agente do cliente");
      passed++;
    } else {
      console.log("❌ TESTE 1 FALHOU: resultado inesperado", result);
      failed++;
    }

    const resultNoPrompt = await handleTestAgentMessage(
      {
        message: "Oi",
        token: "tok_456",
      },
      {
        getTestToken: async () => ({ userId: "user_sem_prompt" }),
        getAgentConfig: async () => ({ prompt: null, model: null }),
        getMistralClient: async () => {
          throw new Error("Não deveria chamar IA sem prompt");
        },
        processAdminMessage: async () => {
          throw new Error("Não deveria cair no Rodrigo quando token é válido");
        },
      }
    );

    if (resultNoPrompt.mode === "client_agent" && resultNoPrompt.response.toLowerCase().includes("ainda não está configurado")) {
      console.log("✅ TESTE 2 PASSOU: token válido sem prompt não cai no Rodrigo");
      passed++;
    } else {
      console.log("❌ TESTE 2 FALHOU: resultado inesperado", resultNoPrompt);
      failed++;
    }

    const resultDemo = await handleTestAgentMessage(
      {
        message: "Oi",
        token: "demo",
      },
      {
        getTestToken: async () => undefined,
        getAgentConfig: async () => undefined,
        getMistralClient: async () => {
          throw new Error("Não deveria chamar IA no demo");
        },
        processAdminMessage: async () => ({ text: "RESPOSTA_RODRIGO" }),
      }
    );

    if (resultDemo.mode === "sales_demo" && resultDemo.response === "RESPOSTA_RODRIGO") {
      console.log("✅ TESTE 3 PASSOU: demo cai no Rodrigo (esperado)");
      passed++;
    } else {
      console.log("❌ TESTE 3 FALHOU: resultado inesperado", resultDemo);
      failed++;
    }

  } catch (err: any) {
    console.error("❌ ERRO NO TESTE:", err?.message || err);
    failed++;
  }

  console.log("\n===========================================");
  console.log("📊 RESULTADO FINAL");
  console.log("===========================================");
  console.log(`✅ Passaram: ${passed}`);
  console.log(`❌ Falharam: ${failed}`);

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
