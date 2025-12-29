
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
  // Este texto NÃO deve aparecer na resposta final - apenas a tag [MEDIA:NOME] é válida
  processed = processed.replace(/\[Áudio enviado:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Imagem enviada:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Vídeo enviado:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Documento enviado:[^\]]*\]/gi, '');

  // 🛡️ FIX CRÍTICO: Remover a palavra "Áudio" solta que vaza do prompt
  // Ex: "Olá tudo bem? Áudio" -> "Olá tudo bem?"
  processed = processed.replace(/\s+Áudio\s*$/i, '');
  processed = processed.replace(/^Áudio\s+/i, '');
  processed = processed.replace(/\s+Audio\s*$/i, '');
  processed = processed.replace(/^Audio\s+/i, '');
  
  processed = processed.trim();
  
  // Regex genérico para capturar QUALQUER variável de nome comum
  // Captura: {{nome}}, {nome}, [nome], {{name}}, {cliente}, {{usuario}}, etc.
  const genericNamePattern = /\{\{?(nome|name|cliente|customer|user|usuario|contato)\}?\}|\[(nome|name|cliente|customer|contato)\]/gi;
  
  if (formattedName) {
    // Substituir qualquer variável de nome pelo nome real
    processed = processed.replace(genericNamePattern, formattedName);
  } else {
    // Remover placeholders não substituídos (incluindo vírgula/espaço antes)
    processed = processed.replace(/,?\s*\{\{?(nome|name|cliente|customer|user|usuario|contato)\}?\}/gi, "");
    processed = processed.replace(/,?\s*\[(nome|name|cliente|customer|contato)\]/gi, "");
  }
  
  return processed;
}
