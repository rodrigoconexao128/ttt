const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'adminAgentService.ts');

console.log('Reading file:', filePath);
let content = fs.readFileSync(filePath, 'utf8');
console.log('File has', content.length, 'characters');

// Find the target section
const targetPattern = /if \(config\.promptStyle === 'human'\) \{\s*\n\s*console\.log\(`✅ \[SALES\] Usando PROMPT HUMANO \(estilo simples\)`\);\s*\n\s*return getHumanPrompt\(stateContext, mediaBlock, memoryInstruction, session\);/;

if (targetPattern.test(content)) {
  console.log('Found target pattern!');
  
  // Replace with new code that includes clientContextBlock
  const replacement = `// Gerar contexto do cliente (saudação dinâmica + nome)
  const clientContextBlock = getClientContextBlock(session);
  
  // Gerar regra de não repetir mídias
  const sentMediaList = session.sentMediaNames || [];
  const mediaRepeatBlock = sentMediaList.length > 0 ? \`
═══════════════════════════════════════════════════════════════════════════════
🚫 MÍDIAS JÁ ENVIADAS NESTA CONVERSA (NÃO REPETIR!)
═══════════════════════════════════════════════════════════════════════════════
Mídias já enviadas: \${sentMediaList.join(', ')}
⚠️ REGRA ABSOLUTA: NUNCA envie a mesma mídia duas vezes na mesma conversa!
\` : '';

  if (config.promptStyle === 'human') {
    console.log(\`✅ [SALES] Usando PROMPT HUMANO (estilo simples)\`);
    return getHumanPrompt(stateContext, mediaBlock, memoryInstruction, session) + clientContextBlock + mediaRepeatBlock;`;
  
  content = content.replace(targetPattern, replacement);
  
  // Also update the nuclear prompt to include context blocks
  const nuclearPattern = /return `🤖 AGENTEZAP\s*\n\s*## Lousa Estratégica de Vendas/;
  
  if (nuclearPattern.test(content)) {
    console.log('Found nuclear pattern!');
    content = content.replace(nuclearPattern, `return \`🤖 AGENTEZAP

\${clientContextBlock}

\${mediaRepeatBlock}

## Lousa Estratégica de Vendas`);
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('File updated successfully!');
} else {
  console.log('Target pattern NOT found');
  
  // Try a simpler search
  console.log('\nSearching for simpler patterns...');
  console.log("Has 'promptStyle': ", content.includes("promptStyle"));
  console.log("Has 'getHumanPrompt': ", content.includes("getHumanPrompt"));
  
  // Show the context around getHumanPrompt
  const idx = content.indexOf("return getHumanPrompt(stateContext");
  if (idx !== -1) {
    console.log('\nContext around getHumanPrompt:');
    console.log(content.substring(idx - 200, idx + 200));
  }
}
