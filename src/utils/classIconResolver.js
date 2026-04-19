const fs = require('fs');
const path = require('path');

const CLASS_ICONS_DIR = path.join(__dirname, '../../assets/class-icons');
const FILE_SUFFIX = '_class_icon_White.png';

const CLASS_FILE_OVERRIDES = {
  'dark knight': 'Dark_Knight'
};

function resolveClassIconFile(className) {
  if (!className || !fs.existsSync(CLASS_ICONS_DIR)) return null;

  const normalizedKey = normalizeClassKey(className);
  if (!normalizedKey) return null;

  const candidates = [];
  if (CLASS_FILE_OVERRIDES[normalizedKey]) {
    candidates.push(CLASS_FILE_OVERRIDES[normalizedKey]);
  }

  const autoBase = toFileBase(className);
  if (autoBase) {
    candidates.push(autoBase);
  }

  const uniqueCandidates = [...new Set(candidates)];
  for (const baseName of uniqueCandidates) {
    const fileName = `${baseName}${FILE_SUFFIX}`;
    const filePath = path.join(CLASS_ICONS_DIR, fileName);
    if (fs.existsSync(filePath)) {
      return { filePath, fileName };
    }
  }

  return null;
}

function normalizeClassKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function toFileBase(value) {
  const tokens = String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return '';
  return tokens.map(toTitleToken).join('_');
}

function toTitleToken(token) {
  const lower = token.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

module.exports = {
  resolveClassIconFile
};
