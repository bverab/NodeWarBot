const fs = require('fs');
const path = require('path');
const { normalizeWar } = require('../utils/warState');

// Capa de persistencia de eventos:
// - Lectura/escritura de data/wars.json
// - Operaciones CRUD por id, messageId y groupId
const filePath = path.join(__dirname, '../../data/wars.json');
const dataDirPath = path.dirname(filePath);

function ensureWarsStore() {
  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf8');
  }
}

function readWarsFile() {
  ensureWarsStore();

  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('JSON invalido en wars.json:', error);
    return [];
  }
}

function loadWars() {
  return readWarsFile().map(normalizeWar);
}

function saveWars(wars) {
  ensureWarsStore();

  const tempFilePath = `${filePath}.tmp`;
  fs.writeFileSync(tempFilePath, JSON.stringify(wars, null, 2), 'utf8');
  fs.renameSync(tempFilePath, filePath);
}

function createWar(data) {
  const wars = loadWars();
  const war = normalizeWar(data);
  wars.push(war);
  saveWars(wars);
  return war;
}

function getWarByMessageId(messageId) {
  const wars = loadWars();
  return wars.find(war => war.messageId === messageId) || null;
}

function getLatestWarByChannelId(channelId) {
  const wars = loadWars().filter(war => war.channelId === channelId);
  if (!wars.length) return null;

  wars.sort((a, b) => b.createdAt - a.createdAt);
  return wars[0];
}

function updateWar(updatedWar) {
  const normalized = normalizeWar(updatedWar);
  const wars = loadWars().map(war => (war.id === normalized.id ? normalized : war));
  saveWars(wars);
  return normalized;
}

function updateWarByMessageId(messageId, updater) {
  // Actualizacion atomica: carga -> muta con callback -> guarda.
  const wars = loadWars();
  const index = wars.findIndex(war => war.messageId === messageId);
  if (index < 0) {
    return { war: null, result: null };
  }

  const war = normalizeWar(wars[index]);
  const result = updater(war);
  wars[index] = war;
  saveWars(wars);

  return { war, result };
}

function deleteWarByMessageId(messageId) {
  const wars = loadWars();
  const filtered = wars.filter(war => war.messageId !== messageId);
  if (filtered.length === wars.length) return false;

  saveWars(filtered);
  return true;
}

/**
 * Obtiene todos los eventos de un grupo (para edición)
 * @param {string} groupId
 * @returns {array}
 */
function getWarsByGroupId(groupId) {
  const wars = loadWars();
  return wars.filter(war => war.groupId === groupId);
}

/**
 * Obtiene un evento específico por groupId + dayOfWeek
 * (Útil para autocomplete en editrole)
 * @param {string} groupId
 * @param {number} dayOfWeek
 * @returns {object|null}
 */
function getWarByGroupAndDay(groupId, dayOfWeek) {
  const wars = loadWars();
  return wars.find(war => war.groupId === groupId && war.dayOfWeek === dayOfWeek) || null;
}

/**
 * Busca eventos por nombre de grupo (para autocomplete)
 * @param {string} searchTerm
 * @returns {array}
 */
function searchWarsByName(searchTerm) {
  const wars = loadWars();
  const term = searchTerm.toLowerCase();
  
  // Agrupar por groupId y retornar uno de cada grupo
  const seen = new Set();
  return wars.filter(war => {
    if (seen.has(war.groupId)) return false;
    if (!war.name?.toLowerCase().includes(term) && !war.groupId?.toLowerCase().includes(term)) {
      return false;
    }
    seen.add(war.groupId);
    return true;
  });
}

/**
 * Obtiene todas las opciones para autocomplete de /editrole
 * @returns {array} - Array de {groupId, dayOfWeek, name, displayName}
 */
function getEditableWarsForAutocomplete() {
  const wars = loadWars();
  return wars
    .filter(war => war.name && war.dayOfWeek !== undefined)
    .map(war => ({
      groupId: war.groupId,
      id: war.id,
      dayOfWeek: war.dayOfWeek,
      name: war.name,
      displayName: `${war.name} - ${getDayName(war.dayOfWeek)}`,
      time: war.time
    }));
}

/**
 * Obtiene nombre del día
 */
function getDayName(dayOfWeek) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayOfWeek] || 'Desconocido';
}

module.exports = {
  loadWars,
  saveWars,
  createWar,
  getWarByMessageId,
  getLatestWarByChannelId,
  updateWar,
  updateWarByMessageId,
  deleteWarByMessageId,
  getWarsByGroupId,
  getWarByGroupAndDay,
  searchWarsByName,
  getEditableWarsForAutocomplete
};
