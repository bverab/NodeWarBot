const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../data/wars.json');

function loadWars() {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveWars(wars) {
  fs.writeFileSync(filePath, JSON.stringify(wars, null, 2));
}

function createWar(data) {
  const wars = loadWars();
  // Asegurar que tiene waitlist
  if (!data.waitlist) {
    data.waitlist = [];
  }
  wars.push(data);
  saveWars(wars);
  return data;
}

function getWarByMessageId(messageId) {
  const wars = loadWars();
  return wars.find(w => w.messageId === messageId);
}

function updateWar(updatedWar) {
  const wars = loadWars().map(w =>
    w.id === updatedWar.id ? updatedWar : w
  );
  saveWars(wars);
}

// Agregar usuario a waitlist
function addToWaitlist(messageId, userId, userName, roleName = null) {
  const wars = loadWars();
  const war = wars.find(w => w.messageId === messageId);
  
  if (!war) return false;
  
  // Evitar duplicados
  if (war.waitlist.some(w => w.userId === userId)) {
    return false;
  }
  
  war.waitlist.push({
    userId,
    userName,
    roleName,
    joinedAt: Date.now()
  });
  
  saveWars(wars);
  return true;
}

// Remover de waitlist
function removeFromWaitlist(messageId, userId) {
  const wars = loadWars();
  const war = wars.find(w => w.messageId === messageId);
  
  if (!war) return false;
  
  war.waitlist = war.waitlist.filter(w => w.userId !== userId);
  saveWars(wars);
  return true;
}

// Obtener siguiente en waitlist (FIFO)
function getNextInWaitlist(messageId) {
  const wars = loadWars();
  const war = wars.find(w => w.messageId === messageId);
  
  if (!war || war.waitlist.length === 0) return null;
  
  return war.waitlist[0]; // El primero en entrar es el primero en salir
}

// Remover usuario de todos los roles (para unirse a otro)
function removeUserFromAllRoles(messageId, userId) {
  const wars = loadWars();
  const war = wars.find(w => w.messageId === messageId);
  
  if (!war) return false;
  
  war.roles.forEach(role => {
    role.users = role.users.filter(u => !u.endsWith(`|${userId}`));
  });
  
  saveWars(wars);
  return true;
}

module.exports = {
  createWar,
  getWarByMessageId,
  updateWar,
  addToWaitlist,
  removeFromWaitlist,
  getNextInWaitlist,
  removeUserFromAllRoles,
  loadWars
};