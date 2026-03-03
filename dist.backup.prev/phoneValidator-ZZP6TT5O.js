import "./chunk-KFQGP6VL.js";

// server/phoneValidator.ts
function validateAndFormatPhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+55")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.startsWith("55")) {
    cleaned = cleaned.substring(2);
  }
  if (cleaned.length !== 11) {
    return null;
  }
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }
  const ddd = parseInt(cleaned.substring(0, 2));
  if (ddd < 11 || ddd > 99) {
    return null;
  }
  const ninthDigit = parseInt(cleaned.charAt(2));
  if (ninthDigit !== 9) {
    return null;
  }
  return `+55${cleaned}`;
}
function isValidPhone(phone) {
  return validateAndFormatPhone(phone) !== null;
}
function formatPhoneForDisplay(phone) {
  const formatted = validateAndFormatPhone(phone);
  if (!formatted) return phone;
  const cleaned = formatted.substring(3);
  return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
}
export {
  formatPhoneForDisplay,
  isValidPhone,
  validateAndFormatPhone
};
