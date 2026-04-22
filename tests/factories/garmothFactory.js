let garmothCounter = 0;

function buildGarmothLink(overrides = {}) {
  garmothCounter += 1;
  const now = Date.now() + garmothCounter;
  return {
    discordUserId: overrides.discordUserId || `discord_${garmothCounter}`,
    guildId: overrides.guildId || 'guild_1',
    garmothProfileUrl: overrides.garmothProfileUrl || `https://garmoth.com/character/test${garmothCounter}`,
    linkedAt: Number.isFinite(overrides.linkedAt) ? overrides.linkedAt : now,
    updatedAt: Number.isFinite(overrides.updatedAt) ? overrides.updatedAt : now,
    characterName: overrides.characterName || `Character${garmothCounter}`,
    classId: Object.prototype.hasOwnProperty.call(overrides, 'classId') ? overrides.classId : 1,
    className: overrides.className || 'Warrior',
    specRaw: overrides.specRaw || '1734',
    spec: overrides.spec || 'Awakening',
    gearScore: Object.prototype.hasOwnProperty.call(overrides, 'gearScore') ? overrides.gearScore : 700,
    lastSyncAt: Object.prototype.hasOwnProperty.call(overrides, 'lastSyncAt') ? overrides.lastSyncAt : now,
    syncStatus: overrides.syncStatus || 'success',
    syncErrorMessage: Object.prototype.hasOwnProperty.call(overrides, 'syncErrorMessage')
      ? overrides.syncErrorMessage
      : null
  };
}

module.exports = {
  buildGarmothLink
};
