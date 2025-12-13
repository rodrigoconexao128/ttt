/**
 * Teste SIMPLIFICADO para verificar se a IA usa [AÇÃO:ENVIAR_QRCODE] corretamente
 * Não depende de banco de dados
 */

import { Mistral } from "@mistralai/mistralai";
import * as dotenv from "dotenv";

dotenv.config();

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

// Função para parsear ações
function parseActions(text: string): ParsedAction[] {
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
  
  return actions;
}

// Função para parsear mídias
function parseMediaTags(text: string): string[] {
  const mediaTagRegex = /\[ENVIAR_MIDIA:([A-Z0-9_]+)\]/gi;
  const mediaTags: string[] = [];
  
  let match: RegExpExecArray | null;
  while ((match = mediaTagRegex.exec(text)) !== null) {
    mediaTags.push(match[1].toUpperCase());
  }
  
  return mediaTags;
}

async function testQRCodeRequest() {
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE: IA deve usar [AÇÃO:ENVIAR_QRCODE] e NÃO [ENVIAR_MIDIA:QR_CODE]");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

  // Simular bloco de mídias (como seria gerado pelo sistema)
  const mediaBlock = `
═══════════════════════════════════════════════════════════════════════════════
📁 SISTEMA DE ENVIO DE MÍDIAS - INSTRUÇÕES OBRIGATÓRIAS
═══════════════════════════════════════════════════════════════════════════════

⚠️⚠️⚠️ REGRA ABSOLUTA - LEIA COM ATENÇÃO ⚠️⚠️⚠️

VOCÊ SÓ PODE USAR ESTAS MÍDIAS (e NENHUMA outra):
COMO_FUNCIONA, TABELA_PRECOS, VIDEO_DEMONSTRACAO, PDF_CONTRATO

🚫 PROIBIDO INVENTAR MÍDIAS! 
- NÃO existe QR_CODE como mídia (QR Code é uma AÇÃO: [AÇÃO:ENVIAR_QRCODE])
- NÃO existe nenhuma mídia que não esteja listada acima
- Se o nome não está na lista, NÃO USE!

⚠️ DIFERENÇA IMPORTANTE:
- [ENVIAR_MIDIA:...] = Arquivos pré-gravados (imagens, áudios, vídeos, PDFs)
- [AÇÃO:...] = Funcionalidades do sistema (criar conta, gerar QR Code, etc)

Para QR CODE DO WHATSAPP: Use [AÇÃO:ENVIAR_QRCODE] (É UMA AÇÃO, NÃO MÍDIA!)
Para CÓDIGO DE 8 DÍGITOS: Use [AÇÃO:SOLICITAR_CODIGO_PAREAMENTO]

🖼️ IMAGENS DISPONÍVEIS:
   • TABELA_PRECOS - Tabela de preços e planos do AgenteZap
     Enviar quando: Cliente perguntar sobre preço, valores, quanto custa

🎵 ÁUDIOS DISPONÍVEIS:
   • COMO_FUNCIONA - como funciona o agentezap
     Enviar quando: Cliente perguntar como funciona, o que é a AgenteZap

🎬 VÍDEOS DISPONÍVEIS:
   • VIDEO_DEMONSTRACAO - Vídeo demonstrativo do sistema funcionando
     Enviar quando: Cliente quiser ver funcionando, pedir demonstração

📄 DOCUMENTOS DISPONÍVEIS:
   • PDF_CONTRATO - Contrato de prestação de serviço
     Enviar quando: Cliente pedir contrato, termos, documento

⚠️ REGRA CRÍTICA: Tags [ENVIAR_MIDIA:NOME] sempre NO FINAL da resposta!

🚫🚫🚫 NUNCA INVENTE MÍDIAS 🚫🚫🚫
Mídias válidas: COMO_FUNCIONA, TABELA_PRECOS, VIDEO_DEMONSTRACAO, PDF_CONTRATO
Se não está na lista acima, NÃO USE!
QR CODE = [AÇÃO:ENVIAR_QRCODE] (é ação, não mídia!)
`;

  // Prompt de sistema completo
  const systemPrompt = `Você é o Rodrigo, atendente da AgenteZap.

SOBRE A AGENTEZAP:
- Plataforma de automação de WhatsApp com IA
- Plano: R$ 99/mês

CLIENTE JÁ POSSUI CONTA - Só precisa conectar o WhatsApp dele.

AÇÕES DISPONÍVEIS (use quando necessário):
[AÇÃO:ENVIAR_QRCODE] - SEMPRE use quando cliente pedir QR Code para conectar WhatsApp
[AÇÃO:SOLICITAR_CODIGO_PAREAMENTO] - SEMPRE use quando cliente pedir código de 8 dígitos
[AÇÃO:ENVIAR_PIX] - Use quando cliente quiser pagar

${mediaBlock}

Responda de forma curta e natural como se fosse WhatsApp. NUNCA use markdown.`;

  // Testar diferentes mensagens sobre QR Code
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
      const actions = parseActions(aiResponse);
      const mediaTags = parseMediaTags(aiResponse);

      const hasQrCodeAction = actions.some(a => a.type === "ENVIAR_QRCODE");
      const hasQrCodeMedia = mediaTags.includes("QR_CODE");
      const hasAnyInventedMedia = mediaTags.some(m => 
        !["COMO_FUNCIONA", "TABELA_PRECOS", "VIDEO_DEMONSTRACAO", "PDF_CONTRATO"].includes(m)
      );

      if (hasQrCodeAction && !hasQrCodeMedia && !hasAnyInventedMedia) {
        console.log("✅ CORRETO! Usou [AÇÃO:ENVIAR_QRCODE]");
        passedTests++;
      } else if (hasQrCodeMedia) {
        console.log("❌ ERRO! Usou [ENVIAR_MIDIA:QR_CODE] que não existe!");
        failedTests++;
      } else if (hasAnyInventedMedia) {
        console.log(`❌ ERRO! Inventou mídia: ${mediaTags.join(", ")}`);
        failedTests++;
      } else if (!hasQrCodeAction) {
        // Verificar se pelo menos prometeu enviar
        if (aiResponse.toLowerCase().includes("qr") && 
            (aiResponse.toLowerCase().includes("envio") || 
             aiResponse.toLowerCase().includes("enviando") || 
             aiResponse.toLowerCase().includes("vai o") ||
             aiResponse.toLowerCase().includes("segue"))) {
          console.log("❌ ERRO: Prometeu enviar QR mas não incluiu [AÇÃO:ENVIAR_QRCODE]");
          failedTests++;
        } else {
          console.log("✅ OK (não prometeu enviar, apenas respondeu)");
          passedTests++;
        }
      } else {
        passedTests++;
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
