const SPEC_VALUES = [
  { label: 'Awakening', match: /\bawakening\b/i },
  { label: 'Succession', match: /\bsuccession\b/i }
];

function parseGarmothProfileHtml(html) {
  const safeHtml = typeof html === 'string' ? html : '';
  const data = {
    characterName: null,
    classId: null,
    className: null,
    specRaw: null,
    spec: null,
    gearScore: null
  };
  const confidence = {
    characterName: 'none',
    className: 'none',
    spec: 'none',
    classId: 'none',
    specRaw: 'none',
    gearScore: 'none'
  };
  const issues = [];

  if (!safeHtml.trim()) {
    return {
      data,
      confidence,
      issues: ['El HTML del perfil llego vacio.'],
      meta: { source: 'none', foundFields: [] }
    };
  }

  const semantic = extractFromSemanticMetadata(safeHtml);
  applyCandidate(data, confidence, 'characterName', semantic.characterName, 'high');
  applyCandidate(data, confidence, 'className', semantic.className, 'high');
  applyCandidate(data, confidence, 'spec', semantic.spec, 'high');

  const scriptContents = extractScriptContents(safeHtml);
  const serializedStates = extractSerializedStates(scriptContents, safeHtml);
  const serialized = extractFromSerializedStates(serializedStates);

  applyCandidate(data, confidence, 'characterName', serialized.characterName, 'medium');
  applyCandidate(data, confidence, 'className', serialized.className, 'medium');
  applyCandidate(data, confidence, 'spec', serialized.spec, 'medium');
  applyCandidate(data, confidence, 'classId', serialized.classId, 'medium');
  applyCandidate(data, confidence, 'specRaw', serialized.specRaw, 'medium');
  applyCandidate(data, confidence, 'gearScore', serialized.gearScore, 'medium');

  const fallback = extractFallbackFromHtml(safeHtml);
  applyCandidate(data, confidence, 'characterName', fallback.characterName, 'low');
  applyCandidate(data, confidence, 'className', fallback.className, 'low');
  applyCandidate(data, confidence, 'spec', fallback.spec, 'low');
  applyCandidate(data, confidence, 'classId', fallback.classId, 'low');
  applyCandidate(data, confidence, 'specRaw', fallback.specRaw, 'low');
  applyCandidate(data, confidence, 'gearScore', fallback.gearScore, 'low');

  if (!isValidCharacterName(data.characterName)) {
    data.characterName = null;
    confidence.characterName = 'none';
    issues.push('No se pudo identificar con confianza el nombre del personaje desde el perfil.');
  }
  if (!isValidClassName(data.className)) {
    data.className = null;
    confidence.className = 'none';
    issues.push('No se pudo identificar con confianza la clase del personaje.');
  }
  if (!isValidNormalizedSpec(data.spec)) {
    data.spec = null;
    confidence.spec = 'none';
    issues.push('No se pudo identificar con confianza la especializacion del personaje.');
  }
  if (!isValidGearScore(data.gearScore)) {
    data.gearScore = null;
    confidence.gearScore = 'none';
  }

  const hasSemanticCore = Boolean(data.characterName && data.className && data.spec);
  const hasRawSignals = Boolean(data.classId !== null || data.specRaw !== null || data.gearScore !== null);
  if (!hasSemanticCore && hasRawSignals) {
    issues.push('Se detectaron datos crudos del perfil, pero no fue posible normalizar clase y especializacion de forma segura.');
  }
  if (!hasSemanticCore && !hasRawSignals) {
    issues.push('El perfil fue leido, pero la estructura no permitio validar datos semanticos confiables.');
  }

  return {
    data,
    confidence,
    issues: unique(issues),
    meta: {
      source: serializedStates.length > 0 ? 'semantic+embedded' : 'semantic+html',
      foundFields: Object.keys(data).filter(key => data[key] !== null)
    }
  };
}

function extractFromSemanticMetadata(html) {
  const result = {
    characterName: null,
    className: null,
    spec: null
  };

  const candidates = [];
  const title = extractTagContent(html, 'title');
  if (title) candidates.push(title);

  for (const property of ['og:title', 'twitter:title']) {
    const value = extractMetaContent(html, property);
    if (value) candidates.push(value);
  }

  const description = extractMetaContent(html, 'description');
  if (description) candidates.push(description);

  for (const text of candidates) {
    const parsed = parseSemanticText(text);
    if (parsed.characterName && !result.characterName) result.characterName = parsed.characterName;
    if (parsed.className && !result.className) result.className = parsed.className;
    if (parsed.spec && !result.spec) result.spec = parsed.spec;
    if (result.characterName && result.className && result.spec) break;
  }

  return result;
}

function parseSemanticText(rawText) {
  const text = sanitizeSemanticText(rawText);
  const parsed = {
    characterName: null,
    className: null,
    spec: null
  };

  // Example: "Makami - Awakening Maegu"
  const primaryPattern = /([A-Za-z0-9_][A-Za-z0-9_\-\s]{1,29})\s*-\s*(awakening|succession)\s+([A-Za-z][A-Za-z\s'-]{1,30})/i;
  const primaryMatch = text.match(primaryPattern);
  if (primaryMatch) {
    parsed.characterName = normalizeName(primaryMatch[1]);
    parsed.spec = normalizeSpec(primaryMatch[2]);
    parsed.className = normalizeClassName(primaryMatch[3]);
    return parsed;
  }

  // Example: "Makami - Maegu (Awakening)"
  const altPattern = /^\s*([^-|]{2,40})\s*-\s*([A-Za-z][A-Za-z\s'-]{1,30})\s*\((awakening|succession)\)\s*$/i;
  const altMatch = text.match(altPattern);
  if (altMatch) {
    parsed.characterName = normalizeName(altMatch[1]);
    parsed.className = normalizeClassName(altMatch[2]);
    parsed.spec = normalizeSpec(altMatch[3]);
    return parsed;
  }

  const spec = extractNormalizedSpec(text);
  if (spec) parsed.spec = spec;
  return parsed;
}

function extractScriptContents(html) {
  const scripts = [];
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const content = match[1];
    if (content && content.trim()) scripts.push(content.trim());
  }
  return scripts;
}

function extractSerializedStates(scriptContents, html) {
  const states = [];

  for (const script of scriptContents) {
    for (const anchor of ['window.__NUXT__', '__NUXT__']) {
      const index = script.indexOf(anchor);
      if (index < 0) continue;
      const assignmentIndex = script.indexOf('=', index);
      if (assignmentIndex < 0) continue;
      const jsonRaw = extractBalancedJsonLike(script, assignmentIndex + 1);
      const parsed = safeJsonParse(jsonRaw);
      if (parsed !== null) states.push(parsed);
    }
  }

  const nuxtDataMatch = /<script\b[^>]*id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (nuxtDataMatch?.[1]) {
    const parsed = safeJsonParse(htmlDecode(nuxtDataMatch[1].trim()));
    if (parsed !== null) states.push(parsed);
  }

  return states;
}

function extractFromSerializedStates(states) {
  const result = {
    characterName: null,
    classId: null,
    className: null,
    specRaw: null,
    spec: null,
    gearScore: null
  };

  if (!Array.isArray(states) || states.length === 0) return result;

  const objects = [];
  for (const state of states) collectObjects(state, objects);

  let best = null;
  let bestScore = -1;

  for (const obj of objects) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    const score = scoreProfileCandidate(obj);
    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  }

  if (best && bestScore >= 6) {
    const name = normalizeName(best.characterName ?? best.character_name ?? best.name);
    const className = normalizeClassName(best.className ?? best.class_name ?? best.class);
    const specRaw = normalizeRawSpec(best.specRaw ?? best.spec_raw ?? best.spec);
    const spec = normalizeSpec(best.specName ?? best.spec_name ?? best.spec);
    const classId = normalizeInt(best.classId ?? best.class_id);

    if (name) result.characterName = name;
    if (className) result.className = className;
    if (specRaw !== null) result.specRaw = specRaw;
    if (spec) result.spec = spec;
    if (classId !== null) result.classId = classId;
  }

  if (!result.classId) {
    result.classId = normalizeInt(findFirstPrimitiveByKeys(states, ['class_id', 'classId'], isLikelyIdNumber));
  }
  if (result.specRaw === null) {
    const specRaw = findFirstPrimitiveByKeys(states, ['spec_raw', 'specRaw', 'spec'], isPrimitiveSpecRaw);
    result.specRaw = normalizeRawSpec(specRaw);
  }
  if (!result.spec) {
    const specText = findFirstPrimitiveByKeys(states, ['spec_name', 'specName', 'spec'], isLikelySpecText);
    result.spec = normalizeSpec(specText);
  }
  if (result.gearScore === null) {
    result.gearScore = extractGearScoreFromNuxtDataStates(states);
  }

  return result;
}

function extractFallbackFromHtml(html) {
  const fallback = {
    characterName: null,
    classId: null,
    className: null,
    specRaw: null,
    spec: null,
    gearScore: null
  };

  const text = stripHtmlToText(html);

  const semanticLine = text.match(/([A-Za-z0-9_]{2,20})\s*-\s*(Awakening|Succession)\s+([A-Za-z][A-Za-z\s'-]{1,30})/i);
  if (semanticLine) {
    fallback.characterName = normalizeName(semanticLine[1]);
    fallback.spec = normalizeSpec(semanticLine[2]);
    fallback.className = normalizeClassName(semanticLine[3]);
  }

  const classIdMatch = text.match(/class\s*id\s*[:\-]?\s*(\d{1,4})/i) || html.match(/class[_\s-]?id["'\s:=]+(\d{1,4})/i);
  if (classIdMatch?.[1]) fallback.classId = normalizeInt(classIdMatch[1]);

  const gsMatch = text.match(/gear\s*score[^0-9]{0,8}(\d{2,4})/i);
  if (gsMatch?.[1]) fallback.gearScore = normalizeGearScore(gsMatch[1]);

  const rawSpecMatch = text.match(/\bspec\s*[:\-]?\s*([A-Za-z0-9_-]{1,40})/i);
  if (rawSpecMatch?.[1]) fallback.specRaw = normalizeRawSpec(rawSpecMatch[1]);

  return fallback;
}

function scoreProfileCandidate(obj) {
  const keys = Object.keys(obj);
  let score = 0;

  if (containsAny(keys, ['characterName', 'character_name', 'className', 'class_name', 'spec', 'spec_name', 'class_id'])) score += 3;
  if (containsAny(keys, ['character', 'profile', 'build'])) score += 2;
  if (isValidCharacterName(obj.characterName ?? obj.character_name ?? obj.name)) score += 3;
  if (isValidClassName(obj.className ?? obj.class_name ?? obj.class)) score += 2;
  if (isValidNormalizedSpec(normalizeSpec(obj.specName ?? obj.spec_name ?? obj.spec))) score += 2;
  if (isLikelyIdNumber(obj.classId ?? obj.class_id)) score += 1;
  return score;
}

function applyCandidate(data, confidence, key, value, level) {
  if (value === null || value === undefined) return;
  if (!shouldReplace(confidence[key], level)) return;
  data[key] = value;
  confidence[key] = level;
}

function shouldReplace(existingLevel, incomingLevel) {
  return confidenceRank(incomingLevel) > confidenceRank(existingLevel);
}

function confidenceRank(level) {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  if (level === 'low') return 1;
  return 0;
}

function extractTagContent(html, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]+)</${tagName}>`, 'i');
  const match = regex.exec(html);
  return match?.[1] ? htmlDecode(match[1].trim()) : null;
}

function extractMetaContent(html, propOrName) {
  const escaped = escapeRegex(propOrName);
  const byProperty = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const byName = new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  return htmlDecode(byProperty.exec(html)?.[1] || byName.exec(html)?.[1] || '').trim() || null;
}

function parseSemanticFromTextLine(text) {
  return parseSemanticText(text);
}

function sanitizeSemanticText(text) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[\-|]\s*Garmoth.*$/i, '')
    .replace(/\s*\|\s*Garmoth.*$/i, '')
    .trim();

  // Keep first sentence where profile summary usually appears.
  const firstSentence = normalized.split('.').map(part => part.trim()).find(Boolean);
  return firstSentence || normalized;
}

function extractNormalizedSpec(text) {
  const normalized = String(text || '');
  for (const spec of SPEC_VALUES) {
    if (spec.match.test(normalized)) return spec.label;
  }
  return null;
}

function normalizeSpec(value) {
  if (value === null || value === undefined) return null;
  return extractNormalizedSpec(String(value));
}

function normalizeName(value) {
  if (!isValidCharacterName(value)) return null;
  return String(value).trim();
}

function normalizeClassName(value) {
  if (!isValidClassName(value)) return null;
  return toTitleCase(String(value).trim());
}

function normalizeRawSpec(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^[A-Za-z][A-Za-z0-9_-]{1,40}$/.test(text)) return text;
  return null;
}

function normalizeInt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGearScore(value) {
  const parsed = normalizeInt(value);
  if (!isValidGearScore(parsed)) return null;
  return parsed;
}

function isValidCharacterName(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text || text.length < 2 || text.length > 30) return false;
  if (/^\d+$/.test(text)) return false;
  return /^[A-Za-z0-9_][A-Za-z0-9_\-\s]{1,29}$/.test(text);
}

function isValidClassName(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text || text.length < 2 || text.length > 30) return false;
  if (/^\d+$/.test(text)) return false;
  return /^[A-Za-z][A-Za-z\s'-]{1,30}$/.test(text);
}

function isValidNormalizedSpec(value) {
  return value === 'Awakening' || value === 'Succession';
}

function isValidGearScore(value) {
  return Number.isInteger(value) && value >= 300 && value <= 900;
}

function isLikelyIdNumber(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 9999;
  if (typeof value === 'string') return /^\d{1,4}$/.test(value.trim());
  return false;
}

function isPrimitiveSpecRaw(value) {
  return value !== null && value !== undefined && (typeof value === 'string' || typeof value === 'number');
}

function isLikelySpecText(value) {
  return typeof value === 'string' && Boolean(normalizeSpec(value));
}

function extractGearScoreFromNuxtDataStates(states) {
  if (!Array.isArray(states)) return null;
  for (const state of states) {
    const value = extractGearScoreFromNuxtDataRoot(state);
    if (value !== null) return value;
  }
  return null;
}

function extractGearScoreFromNuxtDataRoot(root) {
  if (!Array.isArray(root) || root.length === 0) return null;

  const appState = root.find(entry =>
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    Object.prototype.hasOwnProperty.call(entry, 'data') &&
    Object.prototype.hasOwnProperty.call(entry, 'state')
  );
  if (!appState) return null;

  const dataStore = resolveRefObject(root, appState.data);
  const characterPage = resolveRefObject(root, dataStore?.character);
  const buildRefs = resolveRefArray(root, characterPage?.builds);
  if (!Array.isArray(buildRefs) || buildRefs.length === 0) return null;

  const firstBuild = resolveRefObject(root, buildRefs[0]);
  const scoreObj = resolveRefObject(root, firstBuild?.score);
  if (!isStatsScoreObject(scoreObj)) return null;

  const scoreValue = resolveRefNumber(root, scoreObj.score);
  const ap = resolveRefNumber(root, scoreObj.ap);
  const dp = resolveRefNumber(root, scoreObj.dp);
  const aap = resolveRefNumber(root, scoreObj.aap);
  if (
    !Number.isFinite(ap) ||
    !Number.isFinite(dp) ||
    !Number.isFinite(aap) ||
    ap < 100 ||
    dp < 100 ||
    aap < 100
  ) {
    return null;
  }

  return normalizeGearScore(scoreValue);
}

function resolveRefObject(root, ref) {
  let current = ref;
  for (let depth = 0; depth < 6; depth += 1) {
    if (current === null || current === undefined) return null;
    if (typeof current === 'object') {
      if (Array.isArray(current)) {
        const markerRef = extractMarkerRef(current);
        if (markerRef !== null) {
          current = markerRef;
          continue;
        }
        return null;
      }
      return current;
    }
    if (!Number.isInteger(current) || current < 0 || current >= root.length) return null;
    current = root[current];
  }
  return null;
}

function resolveRefArray(root, ref) {
  let current = ref;
  for (let depth = 0; depth < 6; depth += 1) {
    if (current === null || current === undefined) return null;
    if (Array.isArray(current)) {
      const markerRef = extractMarkerRef(current);
      if (markerRef !== null) {
        current = markerRef;
        continue;
      }
      return current;
    }
    if (!Number.isInteger(current) || current < 0 || current >= root.length) return null;
    current = root[current];
  }
  return null;
}

function resolveRefNumber(root, ref) {
  if (!Number.isInteger(ref) || ref < 0 || ref >= root.length) {
    if (typeof ref === 'number' && Number.isFinite(ref)) return ref;
    return null;
  }
  const value = root[ref];
  if (Array.isArray(value) && value[0] === 'Number' && Number.isFinite(value[1])) {
    return value[1];
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function extractMarkerRef(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  if (typeof value[0] !== 'string') return null;
  if (value[0] !== 'Reactive' && value[0] !== 'ShallowReactive' && value[0] !== 'Ref') {
    return null;
  }
  return Number.isInteger(value[1]) ? value[1] : null;
}

function isStatsScoreObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    Object.prototype.hasOwnProperty.call(value, 'ap') &&
    Object.prototype.hasOwnProperty.call(value, 'dp') &&
    Object.prototype.hasOwnProperty.call(value, 'aap') &&
    Object.prototype.hasOwnProperty.call(value, 'score')
  );
}

function findFirstPrimitiveByKeys(states, keys, validator) {
  for (const state of states) {
    const found = findInAny(state, keys, validator);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

function findInAny(value, keys, validator) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInAny(item, keys, validator);
      if (found !== null && found !== undefined) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  for (const [key, current] of Object.entries(value)) {
    if (keys.includes(key) && validator(current)) return current;
  }
  for (const current of Object.values(value)) {
    const found = findInAny(current, keys, validator);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

function collectObjects(value, out) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out);
    return;
  }
  if (typeof value !== 'object') return;
  out.push(value);
  for (const child of Object.values(value)) collectObjects(child, out);
}

function extractBalancedJsonLike(text, startIndex) {
  if (!text || startIndex >= text.length) return null;
  let i = startIndex;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  const opener = text[i];
  if (opener !== '{' && opener !== '[') return null;
  const closer = opener === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let pos = i; pos < text.length; pos += 1) {
    const ch = text[pos];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === opener) depth += 1;
    if (ch === closer) depth -= 1;
    if (depth === 0) {
      return text.slice(i, pos + 1);
    }
  }
  return null;
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(values, expected) {
  const set = new Set(values);
  for (const key of expected) {
    if (set.has(key)) return true;
  }
  return false;
}

function toTitleCase(text) {
  return String(text)
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

module.exports = {
  parseGarmothProfileHtml,
  parseSemanticFromTextLine
};
