function getDraftWar(userId) {
  return global.warEdits?.[userId] || null;
}

function setDraftWar(userId, warData) {
  if (!global.warEdits) global.warEdits = {};
  global.warEdits[userId] = warData;
}

function getScheduleTemp(userId) {
  return global.warScheduleTemp?.[userId] || null;
}

function setScheduleTemp(userId, scheduleTemp) {
  if (!global.warScheduleTemp) global.warScheduleTemp = {};
  global.warScheduleTemp[userId] = scheduleTemp;
}

function clearDraftSession(userId) {
  if (global.warEdits) delete global.warEdits[userId];
  if (global.warEditSelections) delete global.warEditSelections[userId];
  if (global.warScheduleTemp) delete global.warScheduleTemp[userId];
  if (global.warPanelPending) delete global.warPanelPending[userId];
}

module.exports = {
  getDraftWar,
  setDraftWar,
  getScheduleTemp,
  setScheduleTemp,
  clearDraftSession
};
