/**
 * Debug: Simula a divisão de mensagens COM A CORREÇÃO
 */

// Divide texto por frases, garantindo que não corte palavras ou URLs
function splitTextBySentences(text: string, maxChars: number): string[] {
  // PROTEÇÃO DE URLs: Substituir URLs por placeholder temporário
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const protectedUrls: string[] = [];
  
  // Substituir URLs por placeholders numerados
  let protectedText = text.replace(urlRegex, (match) => {
    const index = protectedUrls.length;
    protectedUrls.push(match);
    return `‹URL_${index}›`;
  });
  
  const sentencePattern = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
  const sentences = protectedText.match(sentencePattern) || [protectedText];
  
  // Restaurar URLs nos resultados
  const restoredSentences = sentences.map(sentence => {
    let restored = sentence;
    protectedUrls.forEach((url, index) => {
      restored = restored.replace(`‹URL_${index}›`, url);
    });
    return restored;
  });
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of restoredSentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    const combined = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
    
    if (combined.length <= maxChars) {
      currentChunk = combined;
    } else {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      if (trimmedSentence.length > maxChars) {
        const wordChunks = splitByWords(trimmedSentence, maxChars);
        chunks.push(...wordChunks);
        currentChunk = '';
      } else {
        currentChunk = trimmedSentence;
      }
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// Divide por palavras - PROTEGE URLs
function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const word of words) {
    if (!word) continue;
    
    const combined = currentChunk ? currentChunk + ' ' + word : word;
    
    if (combined.length <= maxChars) {
      currentChunk = combined;
    } else {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      if (word.length > maxChars) {
        // PROTEÇÃO: Se for uma URL, NUNCA quebrar
        if (word.match(/^https?:\/\//i)) {
          console.log(`🔗 URL protegida (não será cortada): ${word}`);
          currentChunk = word;
        } else {
          let remaining = word;
          while (remaining.length > maxChars) {
            chunks.push(remaining.substring(0, maxChars));
            remaining = remaining.substring(maxChars);
          }
          currentChunk = remaining;
        }
      } else {
        currentChunk = word;
      }
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// Função auxiliar para dividir seção
function splitSectionIntoChunks(section: string, maxChars: number): string[] {
  if (section.length <= maxChars) {
    return [section];
  }
  
  const chunks: string[] = [];
  const lines = section.split('\n').filter(l => l.trim());
  
  if (lines.length > 1) {
    let currentChunk = '';
    for (const line of lines) {
      const separator = currentChunk ? '\n' : '';
      if ((currentChunk + separator + line).length <= maxChars) {
        currentChunk = currentChunk + separator + line;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        if (line.length > maxChars) {
          const subChunks = splitTextBySentences(line, maxChars);
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = line;
        }
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }
  
  return splitTextBySentences(section, maxChars);
}

// Função principal
function splitMessageHumanLike(message: string, maxChars: number = 400): string[] {
  if (maxChars === 0) {
    return [message];
  }
  
  if (message.length <= maxChars) {
    return [message];
  }
  
  const finalParts: string[] = [];
  const sections = message.split('\n\n').filter(s => s.trim());
  
  for (const section of sections) {
    const sectionParts = splitSectionIntoChunks(section, maxChars);
    finalParts.push(...sectionParts);
  }
  
  const optimizedParts: string[] = [];
  let currentBuffer = '';
  
  for (const part of finalParts) {
    const separator = currentBuffer ? '\n\n' : '';
    const combined = currentBuffer + separator + part;
    
    if (combined.length <= maxChars) {
      currentBuffer = combined;
    } else {
      if (currentBuffer.trim()) {
        optimizedParts.push(currentBuffer.trim());
      }
      currentBuffer = part;
    }
  }
  
  if (currentBuffer.trim()) {
    optimizedParts.push(currentBuffer.trim());
  }
  
  return optimizedParts.length > 0 ? optimizedParts : [message];
}

// ========================================
// TESTE COM MENSAGEM REAL
// ========================================

const testMessage = `Perfeito, {{nome}}! A AgenteZap é uma **Inteligência Artificial PRÓPRIA**, desenvolvida pra atender seus clientes no WhatsApp como se fosse você. **Não usamos GPT, é tudo tecnologia nossa, sem taxas extras, com tokens ilimitados e sem limites!** Temos o plano ilimitado por **R$49/mês** (com o código **PARC2026PROMO**) ou a implementação por R$199/mês (a gente faz tudo pra você). **Pra testar é só entrar aqui:** https://agentezap.online/. Depois de logado, vai em **Planos**, clica em **Tenho um código de plano personalizado**, insere o código **PARC2026PROMO** e pronto! Assim você garante o plano ilimitado por **R$49/mês** (o valor normal é R$99, mas com o código fica por R$49). Como posso te ajudar a entender melhor?`;

console.log('═'.repeat(80));
console.log('🔍 DEBUG: Divisão de Mensagens (COM CORREÇÃO)');
console.log('═'.repeat(80));
console.log(`\n📝 Mensagem original (${testMessage.length} chars):\n`);
console.log(testMessage);

console.log('\n' + '═'.repeat(80));
console.log('📦 Dividindo com maxChars = 400:');
console.log('═'.repeat(80));

const parts = splitMessageHumanLike(testMessage, 400);

let hasError = false;

parts.forEach((part, i) => {
  console.log(`\n📱 PARTE ${i + 1}/${parts.length} (${part.length} chars):`);
  console.log('─'.repeat(40));
  console.log(part);
  console.log('─'.repeat(40));
  
  // Verificar se tem URL cortada
  if (part.includes(' online/') && !part.includes('agentezap.online/')) {
    console.log('⚠️ POSSÍVEL URL CORTADA DETECTADA!');
    hasError = true;
  }
  
  // Verificar se tem "https://" com o domínio completo
  const urlMatch = part.match(/https?:\/\/[^\s]*/);
  if (urlMatch) {
    console.log(`🔗 URL encontrada: ${urlMatch[0]}`);
    if (urlMatch[0].includes('agentezap.online')) {
      console.log('   ✅ URL COMPLETA!');
    } else {
      console.log('   ⚠️ URL pode estar incompleta');
    }
  }
});

console.log('\n' + '═'.repeat(80));
console.log('🔎 Verificação Final:');
console.log('═'.repeat(80));

const fullText = parts.join(' ');
const urlRegex = /https?:\/\/[^\s]*/g;
const urls = fullText.match(urlRegex) || [];
console.log(`\nURLs encontradas no texto final: ${urls.length}`);
urls.forEach((url, i) => {
  console.log(`  ${i + 1}. ${url}`);
  if (url.includes('agentezap.online')) {
    console.log(`     ✅ URL COMPLETA`);
  } else {
    console.log(`     ⚠️ URL INCOMPLETA!`);
    hasError = true;
  }
});

// Teste específico: verificar se "online/" sozinho aparece
if (fullText.match(/\s+online\//)) {
  console.log('\n⚠️ ERRO: Encontrado "online/" separado do domínio!');
  hasError = true;
}

console.log('\n' + '═'.repeat(80));
if (hasError) {
  console.log('❌ RESULTADO: AINDA HÁ PROBLEMAS');
} else {
  console.log('✅ RESULTADO: TODAS AS URLs ESTÃO PROTEGIDAS!');
}
console.log('═'.repeat(80));
