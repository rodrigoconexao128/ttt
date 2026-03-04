/**
 * Teste para verificar se a IA usa [AÇÃO:ENVIAR_QRCODE] corretamente
 * e não inventa mídias como [ENVIAR_MIDIA:QR_CODE]
 */

import { generateAdminMediaPromptBlock, parseAdminMediaTags } from "./server/adminMediaStore";
import { Mistral } from "@mistralai/mistralai";
import * as dotenv from "dotenv";

dotenv.config();

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

// Função para parsear ações (copiada do adminAgentService)
function parseActions(text: string): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  const actionRegex = /\[AÇÃO:([A-Z_]+)(?:\s+([^\]]+))?\]/g;
  
  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(text)) !== null) {
    const action: ParsedAction = {
      type: match[1],
      params: {},
    };
    
    if (match[2]) {
      const paramsStr = match[2];
      const paramRegex = /([a-z]+)="([^"]+)"/g;
      let paramMatch: RegExpExecArray | null;
      while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
        action.params[paramMatch[1]] = paramMatch[2];
      }
    }
    
    actions.push(action);
  }
  
  const cleanText = text.replace(/\[AÇÃO:[^\]]+\]/g, "").trim();
  return { cleanText, actions };
}

async function testQRCodeRequest() {
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE: IA deve usar [AÇÃO:ENVIAR_QRCODE] e NÃO [ENVIAR_MIDIA:QR_CODE]");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

  // 1. Gerar o bloco de mídias
  console.log("📁 Gerando bloco de mídias...");
  const mediaBlock = await generateAdminMediaPromptBlock();
  console.log(`📁 Bloco gerado: ${mediaBlock.length} caracteres`);
  
  // Verificar se contém o aviso sobre QR Code
  if (mediaBlock.includes("QR CODE DO WHATSAPP: Use [AÇÃO:ENVIAR_QRCODE]")) {
    console.log("✅ Bloco contém aviso sobre QR Code ser AÇÃO, não mídia");
  } else {
    console.log("❌ Bloco NÃO contém aviso sobre QR Code!");
  }
  
  if (mediaBlock.includes("NUNCA INVENTE MÍDIAS")) {
    console.log("✅ Bloco contém aviso para não inventar mídias");
  } else {
    console.log("❌ Bloco NÃO contém aviso para não inventar mídias!");
  }

  console.log("\n");

  // 2. Criar um prompt de sistema completo (simplificado)
  const systemPrompt = `Você é o Rodrigo, atendente da AgenteZap.

SOBRE A AGENTEZAP:
- Plataforma de automação de WhatsApp com IA
- Plano: R$ 99/mês

AÇÕES DISPONÍVEIS (use quando necessário):
[AÇÃO:ENVIAR_QRCODE] - SEMPRE use quando cliente pedir QR Code para conectar WhatsApp
[AÇÃO:SOLICITAR_CODIGO_PAREAMENTO] - SEMPRE use quando cliente pedir código de 8 dígitos
[AÇÃO:ENVIAR_PIX] - Use quando cliente quiser pagar

CLIENTE JÁ POSSUI CONTA - Só precisa conectar o WhatsApp dele.

${mediaBlock}

Responda de forma curta e natural como se fosse WhatsApp.`;

  // 3. Testar diferentes mensagens sobre QR Code
  const testMessages = [
    "gera o qr code pra mim",
    "manda o qrcode",
    "quero conectar pelo computador, me manda o qr",
    "tá, gera o QR Code pra mim também",
    "preciso do qr code pra conectar meu whatsapp",
  ];

  const mistral = new Mistral({
    apiKey: process.env.MISTRAL_API_KEY,
  });

  let passedTests = 0;
  let failedTests = 0;

  for (const message of testMessages) {
    console.log(`\n📤 CLIENTE: "${message}"`);
    
    try {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.3,
        maxTokens: 300,
      });

      const aiResponse = response.choices?.[0]?.message?.content || "";
      console.log(`🤖 RESPOSTA IA: ${aiResponse}`);

      // Verificar se usou AÇÃO ou MÍDIA
      const { actions } = parseActions(aiResponse);
      const { mediaActions } = parseAdminMediaTags(aiResponse);

      const hasQrCodeAction = actions.some(a => a.type === "ENVIAR_QRCODE");
      const hasQrCodeMedia = mediaActions.some(m => m.media_name === "QR_CODE");

      if (hasQrCodeAction && !hasQrCodeMedia) {
        console.log("✅ CORRETO! Usou [AÇÃO:ENVIAR_QRCODE]");
        passedTests++;
      } else if (hasQrCodeMedia) {
        console.log("❌ ERRO! Usou [ENVIAR_MIDIA:QR_CODE] que não existe!");
        failedTests++;
      } else if (!hasQrCodeAction && !hasQrCodeMedia) {
        console.log("⚠️ AVISO: Não usou nenhuma tag (resposta sem ação)");
        // Verificar se pelo menos prometeu enviar
        if (aiResponse.toLowerCase().includes("qr") || aiResponse.toLowerCase().includes("código")) {
          console.log("   → Mas mencionou QR/código sem incluir a ação - PARCIAL");
          failedTests++;
        } else {
          passedTests++;
        }
      }
    } catch (error: any) {
      console.log(`❌ ERRO API: ${error.message}`);
      failedTests++;
    }
    
    // Pequeno delay para não sobrecarregar API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log("📊 RESULTADO FINAL:");
  console.log(`   ✅ Passou: ${passedTests}/${testMessages.length}`);
  console.log(`   ❌ Falhou: ${failedTests}/${testMessages.length}`);
  console.log("═══════════════════════════════════════════════════════════════════════════════");

  if (failedTests === 0) {
    console.log("\n🎉 SUCESSO! IA está usando ações corretamente!");
  } else {
    console.log("\n⚠️ ATENÇÃO: Ainda há problemas. Verifique o prompt.");
  }
}

testQRCodeRequest().catch(console.error);
