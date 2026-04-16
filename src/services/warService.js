const fs = require('fs');
const path = require('path');
const { normalizeWar } = require('../utils/warState');

const filePath = path.join(__dirname, '../../data/wars.json');

function readWarsFile() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]');
  }

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
  fs.writeFileSync(filePath, JSON.stringify(wars, null, 2));
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

module.exports = {
  loadWars,
  saveWars,
  createWar,
  getWarByMessageId,
  getLatestWarByChannelId,
  updateWar,
  updateWarByMessageId,
  deleteWarByMessageId
};
