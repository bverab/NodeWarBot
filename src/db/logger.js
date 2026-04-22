function logInfo(message, meta) {
  if (meta) {
    console.log(`[db] ${message}`, meta);
    return;
  }
  console.log(`[db] ${message}`);
}

function logWarn(message, meta) {
  if (meta) {
    console.warn(`[db] ${message}`, meta);
    return;
  }
  console.warn(`[db] ${message}`);
}

function logError(message, error) {
  if (error) {
    console.error(`[db] ${message}`, error);
    return;
  }
  console.error(`[db] ${message}`);
}

module.exports = {
  logInfo,
  logWarn,
  logError
};
