const fs = require('fs');
const path = require('path');
const { logWarn } = require('./logger');

function getDataDirPath() {
  const custom = process.env.NODEWARBOT_DATA_DIR;
  if (custom && String(custom).trim()) {
    return path.resolve(custom);
  }
  return path.join(__dirname, '../../data');
}

function getWarsFilePath() {
  return path.join(getDataDirPath(), 'wars.json');
}

function getGarmothFilePath() {
  return path.join(getDataDirPath(), 'garmoth-links.json');
}

function ensureDataDir() {
  const dataDirPath = getDataDirPath();
  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }
}

function ensureJsonFile(filePath) {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf8');
  }
}

function readArrayJsonFile(filePath) {
  ensureJsonFile(filePath);
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logWarn(`JSON invalido en ${path.basename(filePath)}. Se usa array vacio.`, error?.message || error);
    return [];
  }
}

function writeArrayJsonFile(filePath, data) {
  ensureJsonFile(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readWarsJson() {
  return readArrayJsonFile(getWarsFilePath());
}

function writeWarsJson(wars) {
  writeArrayJsonFile(getWarsFilePath(), wars);
}

function readGarmothLinksJson() {
  return readArrayJsonFile(getGarmothFilePath());
}

function writeGarmothLinksJson(links) {
  writeArrayJsonFile(getGarmothFilePath(), links);
}

function backupLegacyJsonFiles() {
  ensureDataDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(getDataDirPath(), 'backups', timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const copies = [];
  for (const sourcePath of [getWarsFilePath(), getGarmothFilePath()]) {
    ensureJsonFile(sourcePath);
    const destinationPath = path.join(backupDir, path.basename(sourcePath));
    fs.copyFileSync(sourcePath, destinationPath);
    copies.push(destinationPath);
  }

  return {
    timestamp,
    backupDir,
    files: copies
  };
}

module.exports = {
  getDataDirPath,
  getWarsFilePath,
  getGarmothFilePath,
  readWarsJson,
  writeWarsJson,
  readGarmothLinksJson,
  writeGarmothLinksJson,
  backupLegacyJsonFiles
};
