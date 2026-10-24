// Limites de Discord para modales: el titulo admite hasta 45 caracteres y el valor
// precargado de un campo no puede superar su maxLength (discord.js no lo valida al construir).
const MODAL_TITLE_MAX_LENGTH = 45;

function sliceSafe(text, end) {
  const value = String(text ?? '');
  if (value.length <= end) return value;
  let cut = value.slice(0, end);
  const last = cut.charCodeAt(cut.length - 1);
  // Evita dejar media pareja surrogate (emoji) al final del recorte.
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

function buildModalTitle(prefix, name = '') {
  const base = String(prefix ?? '').trim();
  const label = String(name ?? '').trim();
  const full = label ? `${base}: ${label}` : base;
  if (full.length <= MODAL_TITLE_MAX_LENGTH) return full;
  return `${sliceSafe(full, MODAL_TITLE_MAX_LENGTH - 3)}...`;
}

function clampInputValue(value, maxLength) {
  return sliceSafe(value, maxLength);
}

module.exports = {
  MODAL_TITLE_MAX_LENGTH,
  buildModalTitle,
  clampInputValue
};
