const buckets = new Map();

function consumeRateLimit(key, options = {}) {
  const windowMs = Number.isInteger(options.windowMs) ? options.windowMs : 2500;
  const maxHits = Number.isInteger(options.maxHits) ? options.maxHits : 4;
  const now = Date.now();
  const windowStart = now - windowMs;

  const history = buckets.get(key) || [];
  const recent = history.filter(ts => ts >= windowStart);

  if (recent.length >= maxHits) {
    const retryAfterMs = Math.max(250, windowMs - (now - recent[0]));
    buckets.set(key, recent);
    return {
      allowed: false,
      retryAfterMs
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  return {
    allowed: true,
    retryAfterMs: 0
  };
}

function buildInteractionRateKey(interaction, scope = 'global') {
  return `${scope}:${interaction.user?.id || 'unknown'}:${interaction.customId || 'no-custom-id'}`;
}

module.exports = {
  consumeRateLimit,
  buildInteractionRateKey
};
