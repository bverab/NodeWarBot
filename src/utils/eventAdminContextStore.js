function setSelectedEventContext(userId, guildId, channelId, eventId, options = {}) {
  if (!global.eventAdminSelections) global.eventAdminSelections = {};
  const key = buildContextKey(userId, guildId, channelId);
  const previous = global.eventAdminSelections[key] || {};
  global.eventAdminSelections[key] = {
    eventId: String(eventId),
    scope: options.scope || previous.scope || 'single',
    selectedRoleIndex: Number.isInteger(options.selectedRoleIndex)
      ? options.selectedRoleIndex
      : (Number.isInteger(previous.selectedRoleIndex) ? previous.selectedRoleIndex : null),
    pendingAction: Object.prototype.hasOwnProperty.call(options, 'pendingAction')
      ? options.pendingAction
      : (previous.pendingAction || null),
    pendingPermissionIds: Array.isArray(options.pendingPermissionIds)
      ? options.pendingPermissionIds
      : (Array.isArray(previous.pendingPermissionIds) ? previous.pendingPermissionIds : null),
    pendingMentionRoleIds: Array.isArray(options.pendingMentionRoleIds)
      ? options.pendingMentionRoleIds
      : (Array.isArray(previous.pendingMentionRoleIds) ? previous.pendingMentionRoleIds : null),
    panelMessageId: options.panelMessageId || previous.panelMessageId || null,
    currentView: options.currentView || previous.currentView || 'panel',
    updatedAt: Date.now()
  };
  return global.eventAdminSelections[key];
}

function getSelectedEventContext(userId, guildId, channelId) {
  const key = buildContextKey(userId, guildId, channelId);
  return global.eventAdminSelections?.[key] || null;
}

function clearSelectedEventContext(userId, guildId, channelId) {
  const key = buildContextKey(userId, guildId, channelId);
  if (global.eventAdminSelections) {
    delete global.eventAdminSelections[key];
  }
}

function buildContextKey(userId, guildId, channelId) {
  return `${String(guildId)}:${String(channelId)}:${String(userId)}`;
}

module.exports = {
  setSelectedEventContext,
  getSelectedEventContext,
  clearSelectedEventContext
};
