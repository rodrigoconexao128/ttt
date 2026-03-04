/**
 * Validação e formatação de números de telefone brasileiros
 */

/**
 * Valida e formata número de telefone brasileiro
 * Aceita formatos: 11999999999, +5511999999999
 * Retorna em formato internacional: +5511999999999
 */
export function validateAndFormatPhone(phone: string): string | null {
  if (!phone) return null;

  // Remove espaços, hífens, parênteses
  let cleaned = phone.replace(/[\s\-()]/g, '');

  // Se começa com +55, remove o +
  if (cleaned.startsWith('+55')) {
    cleaned = cleaned.substring(3);
  }

  // Se começa com 55, remove
  if (cleaned.startsWith('55')) {
    cleaned = cleaned.substring(2);
  }

  // Deve ter 11 dígitos (DDD + 9 dígitos do celular)
  if (cleaned.length !== 11) {
    return null;
  }

  // Validar se todos são dígitos
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  // Validar DDD (11-99)
  const ddd = parseInt(cleaned.substring(0, 2));
  if (ddd < 11 || ddd > 99) {
    return null;
  }

  // Validar se é celular (9º dígito deve ser 9)
  const ninthDigit = parseInt(cleaned.charAt(2));
  if (ninthDigit !== 9) {
    return null;
  }

  // Retornar em formato internacional
  return `+55${cleaned}`;
}

/**
 * Valida se o telefone está em formato correto
 */
export function isValidPhone(phone: string): boolean {
  return validateAndFormatPhone(phone) !== null;
}

/**
 * Formata telefone para exibição
 * +5511999999999 -> (11) 99999-9999
 */
export function formatPhoneForDisplay(phone: string): string {
  const formatted = validateAndFormatPhone(phone);
  if (!formatted) return phone;

  // Remove +55
  const cleaned = formatted.substring(3);

  // Formata como (XX) 9XXXX-XXXX
  return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
}

