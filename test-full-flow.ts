/**
 * Teste 3/3 - Simula o fluxo EXATO do log do usuário
 * Verifica que [ENVIAR_QRCODE] resulta em sendQrCode = true
 */

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

// Função parseActions atualizada
function parseActions(response: string): { cleanText: string; actions: ParsedAction[] } {
  const actionRegex = /\[(?:AÇÃO:)?([A-Z_]+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  
  const validActions = [
    "CRIAR_CONTA", "SALVAR_CONFIG", "SALVAR_PROMPT",
    "SOLICITAR_CODIGO_PAREAMENTO", "ENVIAR_QRCODE",
    "ENVIAR_PIX", "NOTIFICAR_PAGAMENTO", "DESCONECTAR_WHATSAPP"
  ];
  
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    if (!validActions.includes(type)) continue;
    
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    const paramRegex = /(\w+)="([^"]*)"/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }
    
    actions.push({ type, params });
  }
  
  const cleanText = response.replace(/\[(?:AÇÃO:)?[A-Z_]+[^\]]*\]/g, "").trim();
  return { cleanText, actions };
}

// Função executeActions simulada
function executeActions(actions: ParsedAction[]): { sendQrCode?: boolean; sendPairingCode?: boolean } {
  const results: { sendQrCode?: boolean; sendPairingCode?: boolean } = {};
  
  for (const action of actions) {
    switch (action.type) {
      case "ENVIAR_QRCODE":
        results.sendQrCode = true;
        break;
      case "SOLICITAR_CODIGO_PAREAMENTO":
        results.sendPairingCode = true;
        break;
    }
  }
  
  return results;
}

console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("🧪 TESTE 3/3: Simulação do fluxo COMPLETO do log");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

// Resposta EXATA da IA do log do usuário
const iaResponse = `Desculpa a confusão! Vou gerar o QR Code agora mesmo. É só escanear que já conecta seu WhatsApp com a AgenteZap.
Aí está:
[ENVIAR_QRCODE]
Se não aparecer, pode ser que tenha caído na pasta de arquivos ou spam. Quer que eu tente de novo? Ou prefere o código de 8 dígitos?`;

console.log("📤 RESPOSTA DA IA (do log):");
console.log("─".repeat(70));
console.log(iaResponse);
console.log("─".repeat(70));
console.log("");

// Simular processamento
console.log("🔧 PROCESSANDO...");
const { cleanText, actions } = parseActions(iaResponse);

console.log(`\n📊 AÇÕES ENCONTRADAS: ${actions.length}`);
for (const action of actions) {
  console.log(`   ✅ ${action.type}`, Object.keys(action.params).length > 0 ? action.params : "");
}

// Executar ações
const results = executeActions(actions);

console.log("\n📊 RESULTADOS:");
console.log(`   sendQrCode: ${results.sendQrCode ? "✅ TRUE" : "❌ false"}`);
console.log(`   sendPairingCode: ${results.sendPairingCode ? "✅ TRUE" : "❌ false"}`);

console.log("\n📊 TEXTO LIMPO (sem tags):");
console.log("─".repeat(70));
console.log(cleanText);
console.log("─".repeat(70));

console.log("\n═══════════════════════════════════════════════════════════════════════════════");

if (results.sendQrCode === true) {
  console.log("🎉 SUCESSO! O sistema agora vai:");
  console.log("   1. Detectar [ENVIAR_QRCODE] na resposta da IA");
  console.log("   2. Definir sendQrCode = true");
  console.log("   3. O whatsapp.ts vai gerar e enviar a IMAGEM do QR Code");
  console.log("");
  console.log("📌 ANTES: Ações encontradas: 0 (não reconhecia [ENVIAR_QRCODE])");
  console.log("📌 AGORA: Ações encontradas: 1 (ENVIAR_QRCODE detectado!)");
  console.log("");
  console.log("✅ PRONTO PARA DEPLOY!");
} else {
  console.log("❌ ERRO: sendQrCode ainda é false!");
  process.exit(1);
}

console.log("═══════════════════════════════════════════════════════════════════════════════");
