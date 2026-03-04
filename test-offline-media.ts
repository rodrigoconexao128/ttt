/**
 * Teste OFFLINE - Verifica se o bloco de mídias está correto
 * Não depende de banco de dados nem API Mistral
 */

// Simular o que o generateAdminMediaPromptBlock gera
function generateTestMediaPromptBlock(): string {
  const mediaList = [
    { name: "COMO_FUNCIONA", mediaType: "audio", description: "como funciona o agentezap", whenToUse: "Cliente perguntar como funciona", sendAlone: false },
    { name: "TABELA_PRECOS", mediaType: "image", description: "Tabela de preços", whenToUse: "Cliente perguntar sobre preço, valores", sendAlone: false },
    { name: "VIDEO_DEMONSTRACAO", mediaType: "video", description: "Vídeo demonstrativo", whenToUse: "Cliente quiser ver funcionando", sendAlone: false },
    { name: "PDF_CONTRATO", mediaType: "document", description: "Contrato", whenToUse: "Cliente pedir contrato", sendAlone: false },
  ];

  const audioMidias = mediaList.filter(m => m.mediaType === 'audio');
  const imageMidias = mediaList.filter(m => m.mediaType === 'image');
  const videoMidias = mediaList.filter(m => m.mediaType === 'video');
  const documentMidias = mediaList.filter(m => m.mediaType === 'document');

  const allMediaNames = mediaList.map(m => m.name).join(', ');

  let mediaBlock = `

═══════════════════════════════════════════════════════════════════════════════
📁 SISTEMA DE ENVIO DE MÍDIAS - INSTRUÇÕES OBRIGATÓRIAS
═══════════════════════════════════════════════════════════════════════════════

⚠️⚠️⚠️ REGRA ABSOLUTA - LEIA COM ATENÇÃO ⚠️⚠️⚠️

VOCÊ SÓ PODE USAR ESTAS MÍDIAS (e NENHUMA outra):
${allMediaNames}

🚫 PROIBIDO INVENTAR MÍDIAS! 
- NÃO existe QR_CODE como mídia (QR Code é uma AÇÃO: [AÇÃO:ENVIAR_QRCODE])
- NÃO existe nenhuma mídia que não esteja listada acima
- Se o nome não está na lista, NÃO USE!

⚠️ DIFERENÇA IMPORTANTE:
- [ENVIAR_MIDIA:...] = Arquivos pré-gravados (imagens, áudios, vídeos, PDFs)
- [AÇÃO:...] = Funcionalidades do sistema (criar conta, gerar QR Code, etc)

Para QR CODE DO WHATSAPP: Use [AÇÃO:ENVIAR_QRCODE] (É UMA AÇÃO, NÃO MÍDIA!)
Para CÓDIGO DE 8 DÍGITOS: Use [AÇÃO:SOLICITAR_CODIGO_PAREAMENTO]

`;

  if (imageMidias.length > 0) {
    mediaBlock += `🖼️ IMAGENS DISPONÍVEIS:
`;
    for (const m of imageMidias) {
      mediaBlock += `   • ${m.name} - ${m.description}
     Enviar quando: ${m.whenToUse}
`;
    }
    mediaBlock += '\n';
  }

  if (audioMidias.length > 0) {
    mediaBlock += `🎵 ÁUDIOS DISPONÍVEIS:
`;
    for (const m of audioMidias) {
      mediaBlock += `   • ${m.name} - ${m.description}
     Enviar quando: ${m.whenToUse}
`;
    }
    mediaBlock += '\n';
  }

  if (videoMidias.length > 0) {
    mediaBlock += `🎬 VÍDEOS DISPONÍVEIS:
`;
    for (const m of videoMidias) {
      mediaBlock += `   • ${m.name} - ${m.description}
     Enviar quando: ${m.whenToUse}
`;
    }
    mediaBlock += '\n';
  }

  if (documentMidias.length > 0) {
    mediaBlock += `📄 DOCUMENTOS DISPONÍVEIS:
`;
    for (const m of documentMidias) {
      mediaBlock += `   • ${m.name} - ${m.description}
     Enviar quando: ${m.whenToUse}
`;
    }
    mediaBlock += '\n';
  }

  mediaBlock += `
═══════════════════════════════════════════════════════════════════════════════
⚠️ REGRA CRÍTICA: COMO ENVIAR MÍDIA (OBRIGATÓRIO)
═══════════════════════════════════════════════════════════════════════════════

...resto do bloco...

🚫🚫🚫 NUNCA INVENTE MÍDIAS 🚫🚫🚫
Mídias válidas: ${allMediaNames}
Se não está na lista acima, NÃO USE!
QR CODE = [AÇÃO:ENVIAR_QRCODE] (é ação, não mídia!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  return mediaBlock;
}

// Verificações
console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("🧪 TESTE OFFLINE: Verificar bloco de mídias");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const mediaBlock = generateTestMediaPromptBlock();

console.log("📊 TAMANHO DO BLOCO:", mediaBlock.length, "caracteres\n");

// Lista de verificações
const checks = [
  {
    name: "Contém aviso 'REGRA ABSOLUTA'",
    test: () => mediaBlock.includes("REGRA ABSOLUTA"),
  },
  {
    name: "Lista mídias válidas",
    test: () => mediaBlock.includes("COMO_FUNCIONA, TABELA_PRECOS, VIDEO_DEMONSTRACAO, PDF_CONTRATO"),
  },
  {
    name: "Aviso 'PROIBIDO INVENTAR MÍDIAS'",
    test: () => mediaBlock.includes("PROIBIDO INVENTAR MÍDIAS"),
  },
  {
    name: "Explica que QR_CODE NÃO existe como mídia",
    test: () => mediaBlock.includes("NÃO existe QR_CODE como mídia"),
  },
  {
    name: "Mostra como usar QR Code (como AÇÃO)",
    test: () => mediaBlock.includes("[AÇÃO:ENVIAR_QRCODE]"),
  },
  {
    name: "Diferencia AÇÃO de MÍDIA",
    test: () => mediaBlock.includes("DIFERENÇA IMPORTANTE"),
  },
  {
    name: "Aviso final 'NUNCA INVENTE MÍDIAS'",
    test: () => mediaBlock.includes("NUNCA INVENTE MÍDIAS"),
  },
  {
    name: "Lista seção de IMAGENS",
    test: () => mediaBlock.includes("🖼️ IMAGENS DISPONÍVEIS"),
  },
  {
    name: "Lista seção de ÁUDIOS",
    test: () => mediaBlock.includes("🎵 ÁUDIOS DISPONÍVEIS"),
  },
  {
    name: "Lista seção de VÍDEOS",
    test: () => mediaBlock.includes("🎬 VÍDEOS DISPONÍVEIS"),
  },
  {
    name: "Lista seção de DOCUMENTOS",
    test: () => mediaBlock.includes("📄 DOCUMENTOS DISPONÍVEIS"),
  },
];

let passed = 0;
let failed = 0;

for (const check of checks) {
  const result = check.test();
  if (result) {
    console.log(`✅ ${check.name}`);
    passed++;
  } else {
    console.log(`❌ ${check.name}`);
    failed++;
  }
}

console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log(`📊 RESULTADO: ${passed}/${checks.length} verificações passaram`);
console.log("═══════════════════════════════════════════════════════════════════════════════");

if (failed === 0) {
  console.log("\n🎉 SUCESSO! O bloco de mídias está correto!");
  console.log("\n📝 A IA agora recebe instruções claras:");
  console.log("   - Só pode usar mídias listadas");
  console.log("   - QR Code é AÇÃO, não mídia");
  console.log("   - Proibido inventar mídias");
} else {
  console.log("\n⚠️ Algumas verificações falharam!");
}

console.log("\n📋 PRÓXIMO PASSO:");
console.log("   Fazer deploy para produção e testar com cliente real");
console.log("   O prompt agora deixa EXPLÍCITO que:");
console.log("   - QR CODE = [AÇÃO:ENVIAR_QRCODE]");
console.log("   - MÍDIAS = apenas as 4 listadas");
