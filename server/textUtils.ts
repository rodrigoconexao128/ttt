
/**
 * Processa placeholders na resposta da IA e limpa artefatos indesejados.
 * @param text Texto original da resposta
 * @param contactName Nome do contato para substituição de variáveis
 */
export function processResponsePlaceholders(text: string, contactName?: string): string {
  if (!text) return text;
  
  const formattedName = contactName && contactName.trim() && !contactName.match(/^\d+$/) 
    ? contactName.trim() 
    : "";
  
  let processed = text;
  
  // 🛡️ LIMPAR INSTRUÇÕES INTERNAS que a IA pode ter copiado
  processed = processed.replace(/\[INSTRUÇÃO CRÍTICA[^\]]*\]/gi, '');
  processed = processed.replace(/Mensagem do cliente:\s*/gi, '');
  processed = processed.replace(/\[INSTRUÇÃO[^\]]*\]/gi, '');
  
  // 🛡️ FIX CRÍTICO: Remover prefixos de mídia que a IA pode ter "aprendido" incorretamente
  // Isso acontece quando a IA vê "🎤 Áudio" no histórico e imita como prefixo
  if (processed.startsWith('🎤 Áudio ') || processed.startsWith('🎤 Audio ')) {
    processed = processed.replace(/^🎤 [ÁáAa]udio\s+/i, '');
    console.log(`🛡️ [AI Agent] Removido prefixo "🎤 Áudio" incorreto da resposta da IA`);
  }
  if (processed.startsWith('🖼️ Imagem ') || processed.startsWith('📷 Imagem ')) {
    processed = processed.replace(/^[🖼️📷]\s*Imagem\s+/i, '');
    console.log(`🛡️ [AI Agent] Removido prefixo de imagem incorreto da resposta da IA`);
  }
  if (processed.startsWith('🎥 Vídeo ') || processed.startsWith('🎬 Vídeo ')) {
    processed = processed.replace(/^[🎥🎬]\s*Vídeo\s+/i, '');
    console.log(`🛡️ [AI Agent] Removido prefixo de vídeo incorreto da resposta da IA`);
  }
  
  // Limpar marcadores internos que não devem aparecer na resposta
  processed = processed.replace(/\[ÁUDIO ENVIADO PELO AGENTE\]:\s*/gi, '');
  processed = processed.replace(/\[IMAGEM ENVIADA:[^\]]*\]/gi, '');
  processed = processed.replace(/\[VÍDEO ENVIADO:[^\]]*\]/gi, '');
  processed = processed.replace(/\[DOCUMENTO ENVIADO:[^\]]*\]/gi, '');
  
  // 🛡️ FIX CRÍTICO: Limpar padrão [Áudio enviado: ...] que a IA está copiando do contexto
  processed = processed.replace(/\[Áudio enviado:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Imagem enviada:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Vídeo enviado:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Documento enviado:[^\]]*\]/gi, '');
  
  // 🛡️ LIMPEZA AGRESSIVA: Remover padrões de mídia em QUALQUER posição
  // Formatos: *Áudio*, [Áudio], (Áudio), Áudio, Audio
  processed = processed.replace(/\*[ÁáAa]udio\*/gi, '');
  processed = processed.replace(/\[[ÁáAa]udio[^\]]*\]/gi, '');
  processed = processed.replace(/\([ÁáAa]udio[^)]*\)/gi, '');
  
  // 🛡️ FIX CRÍTICO: Remover a palavra "Áudio"/"Audio" ISOLADA em qualquer posição
  // Padrões: "? Áudio " no meio, "Áudio " no início, " Áudio" no final
  // Regex: palavra Áudio/Audio cercada por espaços, pontuação ou bordas
  processed = processed.replace(/[\?\!\.]\s*[ÁáAa]udio\s+/gi, '. ');  // "? Áudio " -> ". "
  processed = processed.replace(/\s+[ÁáAa]udio\s*$/gi, '');           // " Áudio" no final
  processed = processed.replace(/^[ÁáAa]udio\s+/gi, '');              // "Áudio " no início
  processed = processed.replace(/\s+[ÁáAa]udio\s+/gi, ' ');           // " Áudio " no meio (CUIDADO: pode remover palavras legítimas como "audiovisual")
  
  // 🛡️ Limpar espaços duplos e pontuação estranha resultante
  // ⚠️ PRESERVAR QUEBRAS DE LINHA - usar [ \t]+ ao invés de \s+ para não remover \n
  processed = processed.replace(/[ \t]+/g, ' ');
  processed = processed.replace(/\.\s*\./g, '.');
  processed = processed.replace(/\?\s*\./g, '?');
  processed = processed.replace(/!\s*\./g, '!');
  
  // 🛡️ Limpar quebras de linha múltiplas (mais de 2) para no máximo 2
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  processed = processed.trim();
  
  // Regex genérico para capturar QUALQUER variável de nome comum
  const genericNamePattern = /\{\{?(nome|name|cliente|customer|user|usuario|contato)\}?\}|\[(nome|name|cliente|customer|contato)\]/gi;
  
  if (formattedName) {
    processed = processed.replace(genericNamePattern, formattedName);
  } else {
    processed = processed.replace(/,?\s*\{\{?(nome|name|cliente|customer|user|usuario|contato)\}?\}/gi, "");
    processed = processed.replace(/,?\s*\[(nome|name|cliente|customer|contato)\]/gi, "");
  }
  
  // 🛡️ FIX: Detectar e limitar respostas concatenadas
  // Padrão: quando a IA repete o mesmo nome mais de 2x, provavelmente concatenou
  if (formattedName && formattedName.length > 2) {
    const escapedName = formattedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(escapedName, 'gi');
    const nameCount = (processed.match(nameRegex) || []).length;
    
    if (nameCount > 2) {
      console.log(`🛡️ [TextUtils] Nome "${formattedName}" repetido ${nameCount}x - truncando resposta`);
      
      // Encontrar a posição da SEGUNDA ocorrência do nome
      let count = 0;
      let secondNameStart = -1;
      let match;
      const searchRegex = new RegExp(escapedName, 'gi');
      
      while ((match = searchRegex.exec(processed)) !== null) {
        count++;
        if (count === 2) {
          secondNameStart = match.index;
          break;
        }
      }
      
      if (secondNameStart > 10) {
        // Cortar ANTES da segunda ocorrência do nome
        const beforeSecond = processed.substring(0, secondNameStart);
        
        // Procurar último ponto de corte natural
        const lastPunctuation = Math.max(
          beforeSecond.lastIndexOf('. '),
          beforeSecond.lastIndexOf('? '),
          beforeSecond.lastIndexOf('! '),
          beforeSecond.lastIndexOf('.')
        );
        
        if (lastPunctuation > 10) {
          processed = processed.substring(0, lastPunctuation + 1).trim();
        } else {
          // Se não encontrou pontuação, corta direto antes do segundo nome
          processed = beforeSecond.trim();
          // Remove vírgula final se houver
          processed = processed.replace(/,\s*$/, '.');
        }
        console.log(`🛡️ [TextUtils] Resposta truncada para evitar concatenação`);
      }
    }
  }
  
  // 🛡️ FIX: Se resposta ficar muito longa (mais de 500 chars), limitar
  // Respostas muito longas geralmente são concatenações
  // ⚠️ EXCEÇÃO: NÃO truncar se for uma LISTA NUMERADA (cardápio, categorias, produtos)
  const isNumberedList = /\d+\.\s+[🎨☁️🔗💼📚🐾🤖🎬🐀🍔💾🔊💰✔️📊💬📸🌐🎮📲🚀🚗🐒🎨📄⏳🎓🔔🏢🔧🖥️🖌️🇬🇧💎👥🛒📡🛠️🖤🎟️💥💻📱⚡🎰📺🎯🔍📲🎁💵✅🔄🤝🗃️💡]/g;
  const numberedItemsCount = (processed.match(isNumberedList) || []).length;
  const hasMultipleNumberedItems = numberedItemsCount >= 5;
  
  if (processed.length > 600 && !hasMultipleNumberedItems) {
    // Encontrar um ponto de corte natural (. ou ? ou !)
    const cutPoint = processed.substring(0, 500).lastIndexOf('. ');
    if (cutPoint > 100) {
      processed = processed.substring(0, cutPoint + 1);
      console.log(`🛡️ [TextUtils] Resposta truncada de ${processed.length} para ${cutPoint + 1} chars`);
    }
  } else if (hasMultipleNumberedItems) {
    console.log(`🛡️ [TextUtils] Lista numerada detectada (${numberedItemsCount} itens) - NÃO truncando`);
  }
  
  return processed.trim();
}
