function formatMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  return meta;
}

function logInfo(message, meta = null) {
  if (meta) {
    console.log(`[app] ${message}`, formatMeta(meta));
    return;
  }
  console.log(`[app] ${message}`);
}

function logWarn(message, meta = null) {
  if (meta) {
    console.warn(`[app] ${message}`, formatMeta(meta));
    return;
  }
  console.warn(`[app] ${message}`);
}

function logError(message, error = null, meta = null) {
  if (meta && error) {
    console.error(`[app] ${message}`, formatMeta(meta), error);
    return;
  }
  if (error) {
    console.error(`[app] ${message}`, error);
    return;
  }
  if (meta) {
    console.error(`[app] ${message}`, formatMeta(meta));
    return;
  }
  console.error(`[app] ${message}`);
}

module.exports = {
  logInfo,
  logWarn,
  logError
};
