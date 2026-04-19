const { parseGarmothProfileHtml } = require('../utils/garmothProfileParser');

const DEFAULT_TIMEOUT_MS = 10000;

async function refreshGarmothLink(link, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

  if (!link?.garmothProfileUrl) {
    return {
      ok: false,
      syncStatus: 'failed',
      syncErrorMessage: 'No hay URL de perfil vinculada.',
      lastSyncAt: now,
      patch: {
        lastSyncAt: now,
        syncStatus: 'failed',
        syncErrorMessage: 'No hay URL de perfil vinculada.'
      }
    };
  }

  try {
    const html = await fetchProfileHtml(link.garmothProfileUrl, timeoutMs);
    const parsed = parseGarmothProfileHtml(html);
    const data = parsed.data || {};
    const hasCoreName = isFilled(data.characterName);
    const hasCoreClass = isFilled(data.className);
    const hasCoreSpec = isFilled(data.spec);
    const coreCount = [hasCoreName, hasCoreClass, hasCoreSpec].filter(Boolean).length;
    const hasRawSignals = [data.classId, data.specRaw, data.gearScore].some(isFilled);

    const syncStatus = resolveSyncStatus(coreCount, hasRawSignals);
    const syncErrorMessage = resolveSyncMessage(syncStatus, parsed.issues || []);

    const patch = {
      lastSyncAt: now,
      syncStatus,
      syncErrorMessage,
      // Always refresh semantic fields, even to null, to avoid keeping stale/bad numeric values.
      characterName: data.characterName ?? null,
      className: data.className ?? null,
      spec: data.spec ?? null
    };

    if (data.classId !== null) patch.classId = data.classId;
    if (data.specRaw !== null) patch.specRaw = data.specRaw;
    if (data.gearScore !== null) patch.gearScore = data.gearScore;

    return {
      ok: true,
      syncStatus,
      syncErrorMessage,
      lastSyncAt: now,
      patch,
      parsedMeta: parsed.meta || null
    };
  } catch (error) {
    const message = normalizeErrorMessage(error);
    return {
      ok: false,
      syncStatus: 'failed',
      syncErrorMessage: message,
      lastSyncAt: now,
      patch: {
        lastSyncAt: now,
        syncStatus: 'failed',
        syncErrorMessage: message
      }
    };
  }
}

async function fetchProfileHtml(url, timeoutMs) {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch no esta disponible en este entorno de Node.js.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'NodeWarBot/1.0 (+manual garmoth refresh)',
        Accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeErrorMessage(error) {
  if (!error) return 'Error desconocido al sincronizar.';
  if (error.name === 'AbortError') return 'Timeout al consultar Garmoth.';
  const message = String(error.message || error).trim();
  if (!message) return 'Error desconocido al sincronizar.';
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
}

function resolveSyncStatus(coreCount, hasRawSignals) {
  if (coreCount === 3) return 'success';
  if (coreCount > 0 || hasRawSignals) return 'partial';
  return 'failed';
}

function resolveSyncMessage(syncStatus, issues) {
  if (syncStatus === 'success') return null;
  const list = Array.isArray(issues) ? issues.filter(Boolean) : [];
  if (list.length > 0) return list[0];
  if (syncStatus === 'partial') {
    return 'El perfil fue leido, pero no se pudo validar toda la informacion semantica.';
  }
  return 'El perfil fue leido, pero la estructura no permitio validar datos semanticos confiables.';
}

function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  return true;
}

module.exports = {
  refreshGarmothLink
};
