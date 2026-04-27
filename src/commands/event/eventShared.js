const { sanitizeUserInput } = require('../../utils/textSafety');
const { logWarn } = require('../../utils/appLogger');

function getSanitizedOption(interaction, name, options = {}) {
  const raw = interaction.options.getString(name, Boolean(options.required));
  const sanitized = sanitizeUserInput(raw, {
    maxLength: options.maxLength,
    allowEmpty: Boolean(options.allowEmpty),
    fallback: ''
  });
  if (sanitized.hadMassMentions) {
    logWarn('Mention masiva neutralizada en event', { userId: interaction.user?.id, option: name });
  }
  return sanitized.value;
}

module.exports = {
  getSanitizedOption
};
