/**
 * Teste OFFLINE - Verificar se o parser de ações funciona com ambos formatos
 */

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

// Função parseActions atualizada (copiada do código corrigido)
function parseActions(response: string): { cleanText: string; actions: ParsedAction[] } {
  // Aceita AMBOS os formatos: [AÇÃO:ENVIAR_QRCODE] e [ENVIAR_QRCODE]
  const actionRegex = /\[(?:AÇÃO:)?([A-Z_]+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  
  // Lista de ações válidas para evitar confusão com mídias
  const validActions = [
    "CRIAR_CONTA",
    "SALVAR_CONFIG", 
    "SALVAR_PROMPT",
    "SOLICITAR_CODIGO_PAREAMENTO",
    "ENVIAR_QRCODE",
    "ENVIAR_PIX",
    "NOTIFICAR_PAGAMENTO",
    "DESCONECTAR_WHATSAPP"
  ];
  
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    
    // Só processa se for uma ação válida (ignora mídias)
    if (!validActions.includes(type)) {
      continue;
    }
    
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    
    // Parse params like email="value" nome="value"
    const paramRegex = /(\w+)="([^"]*)"/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }
    
    actions.push({ type, params });
    console.log(`   🔧 Ação detectada: ${type}`, Object.keys(params).length > 0 ? params : "");
  }
  
  // Remove action tags from text (ambos formatos)
  const cleanText = response.replace(/\[(?:AÇÃO:)?[A-Z_]+[^\]]*\]/g, "").trim();
  
  return { cleanText, actions };
}

console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("🧪 TESTE: Parser de ações com ambos formatos");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

// Casos de teste
const testCases = [
  {
    name: "Formato antigo: [AÇÃO:ENVIAR_QRCODE]",
    input: "Vou enviar o QR Code agora! [AÇÃO:ENVIAR_QRCODE]",
    expectedAction: "ENVIAR_QRCODE",
  },
  {
    name: "Formato novo: [ENVIAR_QRCODE]",
    input: "Aí está o QR Code! [ENVIAR_QRCODE]",
    expectedAction: "ENVIAR_QRCODE",
  },
  {
    name: "SOLICITAR_CODIGO_PAREAMENTO",
    input: "Vou gerar o código de 8 dígitos! [SOLICITAR_CODIGO_PAREAMENTO]",
    expectedAction: "SOLICITAR_CODIGO_PAREAMENTO",
  },
  {
    name: "AÇÃO com parâmetros",
    input: "Vou criar sua conta! [AÇÃO:CRIAR_CONTA email=\"teste@teste.com\"]",
    expectedAction: "CRIAR_CONTA",
  },
  {
    name: "Múltiplas ações",
    input: "Criando conta e gerando QR Code! [AÇÃO:CRIAR_CONTA email=\"x@y.com\"] [ENVIAR_QRCODE]",
    expectedAction: "multiple",
  },
  {
    name: "NÃO deve capturar mídia como ação",
    input: "Aqui está! [ENVIAR_MIDIA:COMO_FUNCIONA]",
    expectedAction: "none",
  },
  {
    name: "Resposta real da IA (do log)",
    input: `Desculpa a confusão! Vou gerar o QR Code agora mesmo. É só escanear que já conecta seu WhatsApp com a AgenteZap.
Aí está:
[ENVIAR_QRCODE]
Se não aparecer, pode ser que tenha caído na pasta de arquivos ou spam.`,
    expectedAction: "ENVIAR_QRCODE",
  },
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  console.log(`📋 Teste: ${tc.name}`);
  console.log(`   Input: "${tc.input.substring(0, 60)}..."`);
  
  const result = parseActions(tc.input);
  
  if (tc.expectedAction === "none") {
    if (result.actions.length === 0) {
      console.log(`   ✅ CORRETO: Nenhuma ação detectada (ignorou mídia)`);
      passed++;
    } else {
      console.log(`   ❌ ERRO: Detectou ação inválida: ${result.actions.map(a => a.type).join(", ")}`);
      failed++;
    }
  } else if (tc.expectedAction === "multiple") {
    if (result.actions.length >= 2) {
      console.log(`   ✅ CORRETO: ${result.actions.length} ações detectadas: ${result.actions.map(a => a.type).join(", ")}`);
      passed++;
    } else {
      console.log(`   ❌ ERRO: Esperava múltiplas ações, encontrou ${result.actions.length}`);
      failed++;
    }
  } else {
    const found = result.actions.find(a => a.type === tc.expectedAction);
    if (found) {
      console.log(`   ✅ CORRETO: Ação "${tc.expectedAction}" detectada!`);
      passed++;
    } else {
      console.log(`   ❌ ERRO: Ação "${tc.expectedAction}" não detectada. Encontradas: ${result.actions.map(a => a.type).join(", ") || "nenhuma"}`);
      failed++;
    }
  }
  
  console.log(`   Texto limpo: "${result.cleanText.substring(0, 50)}..."`);
  console.log("");
}

console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log(`📊 RESULTADO: ${passed}/${testCases.length} testes passaram`);
console.log("═══════════════════════════════════════════════════════════════════════════════");

if (failed === 0) {
  console.log("\n🎉 SUCESSO! Parser de ações funcionando corretamente!");
  console.log("\nAgora o sistema irá:");
  console.log("   1. Detectar [ENVIAR_QRCODE] (sem AÇÃO:)");
  console.log("   2. Detectar [AÇÃO:ENVIAR_QRCODE] (formato antigo)");
  console.log("   3. Gerar e enviar a imagem do QR Code");
} else {
  console.log(`\n⚠️ ${failed} testes falharam!`);
  process.exit(1);
}
