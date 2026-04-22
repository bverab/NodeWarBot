const {
  loadCharacterLinks,
  saveCharacterLinks,
  getCharacterLinkByDiscordUserId,
  getCharacterLink,
  getCharacterLinksByGuild,
  upsertCharacterLink,
  updateCharacterLink,
  removeCharacterLinkByDiscordUserId,
  removeCharacterLink
} = require('../db/garmothProfileRepository');

module.exports = {
  loadCharacterLinks,
  saveCharacterLinks,
  getCharacterLinkByDiscordUserId,
  getCharacterLink,
  getCharacterLinksByGuild,
  upsertCharacterLink,
  updateCharacterLink,
  removeCharacterLinkByDiscordUserId,
  removeCharacterLink
};
