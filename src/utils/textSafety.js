const DISCORD_LIMITS = {
  messageContent: 2000,
  embedTitle: 256,
  embedDescription: 4096,
  embedFieldName: 256,
  embedFieldValue: 1024
};

const MASS_MENTION_PATTERN = /@(everyone|here)\b/gi;

function toCleanString(value) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n');
}

function truncateText(value, maxLength) {
  if (!Number.isInteger(maxLength) || maxLength < 1) return String(value ?? '');
  const text = String(value ?? '');
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function neutralizeMassMentions(value) {
  return String(value ?? '').replace(MASS_MENTION_PATTERN, (_, token) => `@\u200b${token}`);
}

function sanitizeUserInput(value, options = {}) {
  const {
    trim = true,
    allowEmpty = false,
    maxLength = null,
    fallback = '',
    blockMassMentions = true
  } = options;

  const original = toCleanString(value);
  let sanitized = trim ? original.trim() : original;
  const hadMassMentions = MASS_MENTION_PATTERN.test(sanitized);

  if (blockMassMentions) {
    sanitized = neutralizeMassMentions(sanitized);
  }

  if (Number.isInteger(maxLength)) {
    sanitized = truncateText(sanitized, maxLength);
  }

  const isEmpty = sanitized.length === 0;
  if (!allowEmpty && isEmpty) {
    sanitized = String(fallback ?? '');
  }

  return {
    value: sanitized,
    isEmpty: sanitized.length === 0,
    hadMassMentions,
    changed: sanitized !== original
  };
}

function sanitizeDisplayText(value, options = {}) {
  const {
    maxLength = 80,
    fallback = '-',
    trim = true
  } = options;

  return sanitizeUserInput(value, {
    trim,
    allowEmpty: false,
    maxLength,
    fallback,
    blockMassMentions: true
  }).value;
}

function safeMessageContent(value, fallback = '') {
  return sanitizeDisplayText(value, {
    maxLength: DISCORD_LIMITS.messageContent,
    fallback
  });
}

function safeEmbedTitle(value, fallback = 'Sin titulo') {
  return sanitizeDisplayText(value, {
    maxLength: DISCORD_LIMITS.embedTitle,
    fallback
  });
}

function safeEmbedDescription(value, fallback = '-') {
  return sanitizeDisplayText(value, {
    maxLength: DISCORD_LIMITS.embedDescription,
    fallback
  });
}

function safeEmbedFieldName(value, fallback = 'Campo') {
  return sanitizeDisplayText(value, {
    maxLength: DISCORD_LIMITS.embedFieldName,
    fallback
  });
}

function safeEmbedFieldValue(value, fallback = '-') {
  return sanitizeDisplayText(value, {
    maxLength: DISCORD_LIMITS.embedFieldValue,
    fallback
  });
}

module.exports = {
  DISCORD_LIMITS,
  truncateText,
  neutralizeMassMentions,
  sanitizeUserInput,
  sanitizeDisplayText,
  safeMessageContent,
  safeEmbedTitle,
  safeEmbedDescription,
  safeEmbedFieldName,
  safeEmbedFieldValue
};
