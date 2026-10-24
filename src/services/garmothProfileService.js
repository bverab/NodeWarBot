const { parseGarmothProfileHtml } = require('../utils/garmothProfileParser');
const { validateAndNormalizeGarmothProfileUrl, isAllowedGarmothFetchUrl } = require('../utils/garmothUrlHelper');

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 3 * 1024 * 1024;

async function refreshGarmothLink(link, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

  if (!link?.garmothProfileUrl) {
    return buildFailedResult(now, 'No hay URL de perfil vinculada.');
  }

  // La URL guardada pudo llegar por otra via (importaciones, dashboard): se revalida antes de salir a la red.
  const validation = validateAndNormalizeGarmothProfileUrl(link.garmothProfileUrl);
  if (!validation.ok) {
    return buildFailedResult(now, `La URL vinculada no es un perfil valido de Garmoth: ${validation.reason}.`);
  }

  try {
    const html = await fetchProfileHtml(validation.url, timeoutMs, options.fetchImpl);
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
      syncErrorMessage
    };

    // Si el parseo no obtuvo nada, se conservan los datos ya sincronizados en vez de pisarlos con null.
    // Con datos parciales se refrescan los campos semanticos (incluso a null) para no dejar valores viejos o invalidos.
    if (syncStatus !== 'failed') {
      patch.characterName = data.characterName ?? null;
      patch.className = data.className ?? null;
      patch.spec = data.spec ?? null;
    }

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
    return buildFailedResult(now, normalizeErrorMessage(error));
  }
}

function buildFailedResult(now, message) {
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

async function fetchProfileHtml(url, timeoutMs, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch no esta disponible en este entorno de Node.js.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let currentUrl = url;
    // Las redirecciones se siguen a mano para validar cada destino ANTES de pedirlo.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!isAllowedGarmothFetchUrl(currentUrl)) {
        throw new Error('Redireccion a un host que no es de Garmoth.');
      }

      const response = await fetchImpl(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'NodeWarBot/1.0 (+manual garmoth refresh)',
          Accept: 'text/html,application/xhtml+xml'
        },
        redirect: 'manual',
        signal: controller.signal
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get?.('location');
        if (!location) throw new Error(`HTTP ${response.status} sin destino de redireccion.`);
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }

      if (response.url && !isAllowedGarmothFetchUrl(response.url)) {
        throw new Error('La respuesta final no proviene de un host de Garmoth.');
      }

      return await readBodyWithLimit(response, MAX_BODY_BYTES);
    }

    throw new Error('Demasiadas redirecciones al consultar Garmoth.');
  } finally {
    clearTimeout(timeout);
  }
}

function bodyTooLargeError() {
  return new Error('La respuesta de Garmoth es demasiado grande (maximo 3 MB).');
}

async function readBodyWithLimit(response, maxBytes) {
  const declared = Number.parseInt(response.headers?.get?.('content-length') || '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw bodyTooLargeError();
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw bodyTooLargeError();
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw bodyTooLargeError();
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => null);
    throw error;
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
