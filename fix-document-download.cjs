const fs = require('fs');
let content = fs.readFileSync('./server/whatsapp.ts', 'utf8');

// Encontrar e substituir a seção de documento do cliente
// Buscar pelo padrão exato
const idx = content.indexOf('// Check for document');
if (idx === -1) {
  console.log('ERROR: Seção "Check for document" não encontrada');
  process.exit(1);
}

// Extrair trecho para verificar
console.log('Trecho encontrado:');
console.log(content.substring(idx, idx + 500));

// Encontrar final da seção (próximo else {)
const searchArea = content.substring(idx);
const elseIdx = searchArea.indexOf('  // Ignorar mensagens');

if (elseIdx === -1) {
  console.log('ERROR: Não encontrou fim da seção');
  process.exit(1);
}

// Texto antigo (da posição idx até o else)
const oldSection = content.substring(idx, idx + elseIdx);
console.log('\n--- Seção antiga ---');
console.log(oldSection);
console.log('--- Fim seção antiga ---\n');

// Nova seção com download
const newSection = `// Check for document (PDF, DOC, etc) - COM DOWNLOAD
  else if (msg?.documentMessage) {
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    mediaCaption = msg.documentMessage.caption || null;
    const fileName = msg.documentMessage.fileName || "Documento";
    messageText = mediaCaption || \`📄 \${fileName}\`;
    
    // 📄 DOCUMENTO DO CLIENTE: Baixar para exibir/download no chat
    try {
      console.log(\`📄 [CLIENT] Baixando documento: \${fileName}...\`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = \`data:\${mediaMimeType};base64,\${buffer.toString("base64")}\`;
      console.log(\`✅ [CLIENT] Documento baixado: \${buffer.length} bytes\`);
    } catch (error) {
      console.error("❌ [CLIENT] Erro ao baixar documento:", error);
      mediaUrl = null;
    }
  }
  `;

// Substituir
content = content.substring(0, idx) + newSection + content.substring(idx + elseIdx);

// Salvar
fs.writeFileSync('./server/whatsapp.ts', content, 'utf8');
console.log('SUCCESS: Arquivo atualizado!');
