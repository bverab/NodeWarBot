const {
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
} = require('../db/warRepository');

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
