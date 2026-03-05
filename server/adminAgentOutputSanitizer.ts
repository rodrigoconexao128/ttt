/**
 * ========================================================================
 * ADMIN AGENT OUTPUT SANITIZER — Sanitizador de Output
 * ========================================================================
 * Camada final antes de enviar a resposta ao cliente.
 * Funciona como "Layer 6" do orquestrador.
 *
 * Responsabilidades:
 *  - Remover mojibake (caracteres quebrados UTF-8)
 *  - Converter markdown admin → formato WhatsApp
 *  - Remover artefatos de LLM (tags, metadados, etc.)
 *  - Detectar e bloquear falso "conta existente"
 *  - Limitar tamanho da resposta
 */

// ============================================================================
// MOJIBAKE REPAIR MAP
// ============================================================================

/** Mapa expandido de mojibake → texto correto */
const MOJIBAKE_REPAIRS: Array<[RegExp, string]> = [
  // V16: Acentuações comuns — agora preservam acentos corretos em UTF-8
  [/vocÃª/gi, "você"],
  [/nÃ£o/gi, "não"],
  [/jÃ¡/gi, "já"],
  [/negÃ³cio/gi, "negócio"],
  [/dÃºvida/gi, "dúvida"],
  [/preÃ§o/gi, "preço"],
  [/informaÃ§Ã£o/gi, "informação"],
  [/configuraÃ§Ã£o/gi, "configuração"],
  [/grÃ¡tis/gi, "grátis"],
  [/serviÃ§o/gi, "serviço"],
  [/horÃ¡rio/gi, "horário"],
  [/criaÃ§Ã£o/gi, "criação"],
  [/funÃ§Ã£o/gi, "função"],
  [/soluÃ§Ã£o/gi, "solução"],
  [/RecepÃ§Ã£o/gi, "Recepção"],
  [/situaÃ§Ã£o/gi, "situação"],
  [/condiÃ§Ã£o/gi, "condição"],
  [/operaÃ§Ã£o/gi, "operação"],
  [/relaÃ§Ã£o/gi, "relação"],
  [/proteÃ§Ã£o/gi, "proteção"],
  [/educaÃ§Ã£o/gi, "educação"],
  [/comunicaÃ§Ã£o/gi, "comunicação"],
  [/organizaÃ§Ã£o/gi, "organização"],
  [/produÃ§Ã£o/gi, "produção"],
  [/construÃ§Ã£o/gi, "construção"],
  [/instruÃ§Ã£o/gi, "instrução"],
  [/descriÃ§Ã£o/gi, "descrição"],
  [/sugestÃ£o/gi, "sugestão"],
  [/questÃ£o/gi, "questão"],
  [/exceÃ§Ã£o/gi, "exceção"],
  [/aÃ§Ã£o/gi, "ação"],
  [/correÃ§Ã£o/gi, "correção"],
  [/direÃ§Ã£o/gi, "direção"],
  [/geraÃ§Ã£o/gi, "geração"],
  [/aplicaÃ§Ã£o/gi, "aplicação"],
  [/integraÃ§Ã£o/gi, "integração"],
  [/automaÃ§Ã£o/gi, "automação"],
  [/simulaÃ§Ã£o/gi, "simulação"],
  [/verificaÃ§Ã£o/gi, "verificação"],
  [/validaÃ§Ã£o/gi, "validação"],
  [/notificaÃ§Ã£o/gi, "notificação"],

  // Generic diacritical fragments — preservam acentos
  [/Ã£o\b/g, "ão"],
  [/Ã©/g, "é"],
  [/Ã¡/g, "á"],
  [/Ãª/g, "ê"],
  [/Ã³/g, "ó"],
  [/Ãº/g, "ú"],
  [/Ã§/g, "ç"],
  [/Ã­/g, "í"],
  [/Ã´/g, "ô"],
  [/Ãµ/g, "õ"],
  [/Ã /g, "à"],
  [/Ã¢/g, "â"],
];

// ============================================================================
// MARKDOWN → WHATSAPP
// ============================================================================

/** Converte markdown de admin para formato WhatsApp */
function convertMarkdownToWhatsApp(text: string): string {
  return text
    // Headers → bold
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    // Bold ** ou __ → *
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    // Itálico _ → _
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "_$1_")
    // Strikethrough ~~ → ~
    .replace(/~~(.+?)~~/g, "~$1~")
    // Code blocks ``` → remover
    .replace(/```[\s\S]*?```/g, "")
    // Inline code ` → remover backticks
    .replace(/`([^`]+)`/g, "$1")
    // Links [text](url) → text: url
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2")
    // Horizontal rules
    .replace(/^[-_*]{3,}$/gm, "")
    // Excess newlines
    .replace(/\n{3,}/g, "\n\n");
}

// ============================================================================
// FALSE EXISTING ACCOUNT DETECTOR
// ============================================================================

/** Padrões que indicam "manteve conta existente" falso */
const FALSE_EXISTING_PATTERNS = [
  /mantive sua conta/i,
  /conta j[aá] existente/i,
  /mantive a conta/i,
  /conta que voc[eê] j[aá] (tinha|tem|possui)/i,
  /usei sua conta anterior/i,
  /aproveitei seu cadastro/i,
  /conta existente.*mante/i,
  /mante.*conta existente/i,
];

/**
 * Detecta se o texto contém menção falsa a "conta existente"
 * quando o contexto indica que NÃO é uma conta existente.
 */
export function detectFalseExisting(text: string, isExistingAccount: boolean): boolean {
  if (isExistingAccount) return false; // É realmente existente, não é falso
  return FALSE_EXISTING_PATTERNS.some(p => p.test(text));
}

/**
 * Remove menções falsas a "conta existente" do texto.
 */
function removeFalseExistingMentions(text: string): string {
  let cleaned = text;
  for (const pattern of FALSE_EXISTING_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

// ============================================================================
// LLM ARTIFACT REMOVER
// ============================================================================

/** Remove artefatos comuns de LLM */
function removeLLMArtefacts(text: string): string {
  return text
    // Remove tags XML/HTML residuais de raciocínio
    .replace(/<\/?(?:thinking|reasoning|internal|thought|scratchpad)[^>]*>/gi, "")
    // Remove prefixos de role comuns
    .replace(/^(?:assistant|rodrigo|agente|bot):\s*/gim, "")
    // Remove metadata JSON perdido
    .replace(/\{[^{}]*"(?:action|intent|type)"[^{}]*\}/g, "")
    // Remove escape sequences
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .trim();
}

// ============================================================================
// MAIN SANITIZER
// ============================================================================

export interface SanitizeOptions {
  /** Se é conta existente (para filtrar falso positivo) */
  isExistingAccount?: boolean;
  /** Tamanho máximo da resposta (chars) */
  maxLength?: number;
  /** Se deve converter markdown → WhatsApp */
  convertMarkdown?: boolean;
  /** Se deve remover artefatos de LLM */
  removeLLMArtefacts?: boolean;
}

export interface SanitizeResult {
  /** Texto sanitizado */
  text: string;
  /** Se mojibake foi detectado e corrigido */
  hadMojibake: boolean;
  /** Se "conta existente" falso foi detectado e removido */
  hadFalseExisting: boolean;
  /** Score de mojibake residual */
  mojibakeResidualScore: number;
  /** Quantos chars foram removidos */
  charsRemoved: number;
}

/**
 * Sanitiza a resposta do admin agent antes de enviar ao cliente.
 * Aplica todas as camadas de limpeza em sequência.
 */
export function sanitizeOutput(text: string, options: SanitizeOptions = {}): SanitizeResult {
  const {
    isExistingAccount = false,
    maxLength = 4000,
    convertMarkdown = true,
    removeLLMArtefacts: shouldRemoveLLM = true,
  } = options;

  const originalLength = text.length;
  let cleaned = text;

  // (1) Remove artefatos de LLM
  if (shouldRemoveLLM) {
    cleaned = removeLLMArtefacts(cleaned);
  }

  // (2) Converte markdown → WhatsApp
  if (convertMarkdown) {
    cleaned = convertMarkdownToWhatsApp(cleaned);
  }

  // (3) Remove control chars
  cleaned = cleaned
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    .replace(/\uFFFD/g, "")
    .replace(/ï¿½/g, "");

  // (4) Repara mojibake
  let hadMojibake = false;
  const beforeMojibake = cleaned;
  for (const [pattern, replacement] of MOJIBAKE_REPAIRS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  if (cleaned !== beforeMojibake) hadMojibake = true;

  // (5) Remove Ã clusters residuais
  cleaned = cleaned.replace(/[ÃÂ]{2,}/g, " ");

  // (6) Check mojibake residual
  // V16: Removido nuclear mojibake cleanup que destruía palavras portuguesas válidas

  // (7) Detecta e remove "conta existente" falso
  let hadFalseExisting = false;
  if (!isExistingAccount && detectFalseExisting(cleaned, isExistingAccount)) {
    cleaned = removeFalseExistingMentions(cleaned);
    hadFalseExisting = true;
    console.log("[SANITIZER-V12] Removida menção falsa a conta existente");
  }

  // (8) Normaliza whitespace
  cleaned = cleaned
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  // (9) Limita tamanho
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength - 3) + "...";
  }

  return {
    text: cleaned,
    hadMojibake,
    hadFalseExisting,
    mojibakeResidualScore: 0,
    charsRemoved: originalLength - cleaned.length,
  };
}
