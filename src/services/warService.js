const repository = require('../db/warRepository');
const { logError } = require('../utils/appLogger');

function withDbLog(operationName, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(`Fallo DB en warService.${operationName}`, error);
      throw error;
    }
  };
}

module.exports = {
  loadWars: (...args) => {
    try {
      return repository.loadWars(...args);
    } catch (error) {
      logError('Fallo DB en warService.loadWars', error);
      throw error;
    }
  },
  saveWars: withDbLog('saveWars', repository.saveWars),
  createWar: withDbLog('createWar', repository.createWar),
  getWarByMessageId: (...args) => {
    try {
      return repository.getWarByMessageId(...args);
    } catch (error) {
      logError('Fallo DB en warService.getWarByMessageId', error);
      throw error;
    }
  },
  getLatestWarByChannelId: (...args) => {
    try {
      return repository.getLatestWarByChannelId(...args);
    } catch (error) {
      logError('Fallo DB en warService.getLatestWarByChannelId', error);
      throw error;
    }
  },
  updateWar: withDbLog('updateWar', repository.updateWar),
  updateWarByMessageId: withDbLog('updateWarByMessageId', repository.updateWarByMessageId),
  deleteWarByMessageId: withDbLog('deleteWarByMessageId', repository.deleteWarByMessageId),
  getWarsByGroupId: (...args) => {
    try {
      return repository.getWarsByGroupId(...args);
    } catch (error) {
      logError('Fallo DB en warService.getWarsByGroupId', error);
      throw error;
    }
  },
  getWarByGroupAndDay: (...args) => {
    try {
      return repository.getWarByGroupAndDay(...args);
    } catch (error) {
      logError('Fallo DB en warService.getWarByGroupAndDay', error);
      throw error;
    }
  },
  searchWarsByName: (...args) => {
    try {
      return repository.searchWarsByName(...args);
    } catch (error) {
      logError('Fallo DB en warService.searchWarsByName', error);
      throw error;
    }
  },
  getEditableWarsForAutocomplete: (...args) => {
    try {
      return repository.getEditableWarsForAutocomplete(...args);
    } catch (error) {
      logError('Fallo DB en warService.getEditableWarsForAutocomplete', error);
      throw error;
    }
  }
};
