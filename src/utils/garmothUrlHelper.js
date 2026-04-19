function validateAndNormalizeGarmothProfileUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return { ok: false, reason: 'URL vacia' };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: 'Formato de URL invalido' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    return { ok: false, reason: 'Solo se permiten URLs http/https' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!isGarmothHost(hostname)) {
    return { ok: false, reason: 'La URL no pertenece a Garmoth' };
  }

  const path = parsed.pathname.toLowerCase();
  const hasProfilePath =
    path.includes('/character/') ||
    path.includes('/characters/') ||
    path.includes('/profile/');
  if (!hasProfilePath) {
    return { ok: false, reason: 'La URL no parece de perfil de Garmoth' };
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.protocol = 'https:';
  const normalizedUrl = parsed.toString().replace(/\/$/, '');

  return { ok: true, url: normalizedUrl };
}

function isGarmothHost(hostname) {
  return hostname === 'garmoth.com' || hostname.endsWith('.garmoth.com');
}

module.exports = {
  validateAndNormalizeGarmothProfileUrl
};
