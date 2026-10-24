// Un valor explicito (incluido null) reemplaza al anterior; omitido o undefined conserva el anterior.
function hasExplicit(options, key) {
  return Object.prototype.hasOwnProperty.call(options, key) && options[key] !== undefined;
}

function setSelectedEventContext(userId, guildId, channelId, eventId, options = {}) {
  if (!global.eventAdminSelections) global.eventAdminSelections = {};
  const key = buildContextKey(userId, guildId, channelId);
  const previous = global.eventAdminSelections[key] || {};
  global.eventAdminSelections[key] = {
    eventId: String(eventId),
    scope: options.scope || previous.scope || 'single',
    selectedRoleIndex: hasExplicit(options, 'selectedRoleIndex')
      ? (Number.isInteger(options.selectedRoleIndex) ? options.selectedRoleIndex : null)
      : (Number.isInteger(previous.selectedRoleIndex) ? previous.selectedRoleIndex : null),
    pendingAction: Object.prototype.hasOwnProperty.call(options, 'pendingAction')
      ? options.pendingAction
      : (previous.pendingAction || null),
    pendingPermissionIds: hasExplicit(options, 'pendingPermissionIds')
      ? (Array.isArray(options.pendingPermissionIds) ? options.pendingPermissionIds : null)
      : (Array.isArray(previous.pendingPermissionIds) ? previous.pendingPermissionIds : null),
    pendingMentionRoleIds: hasExplicit(options, 'pendingMentionRoleIds')
      ? (Array.isArray(options.pendingMentionRoleIds) ? options.pendingMentionRoleIds : null)
      : (Array.isArray(previous.pendingMentionRoleIds) ? previous.pendingMentionRoleIds : null),
    pendingAllowedUserIds: hasExplicit(options, 'pendingAllowedUserIds')
      ? (Array.isArray(options.pendingAllowedUserIds) ? options.pendingAllowedUserIds : null)
      : (Array.isArray(previous.pendingAllowedUserIds) ? previous.pendingAllowedUserIds : null),
    pendingPveOptionId: Object.prototype.hasOwnProperty.call(options, 'pendingPveOptionId')
      ? options.pendingPveOptionId
      : (previous.pendingPveOptionId || null),
    pendingPveEnrollmentKey: Object.prototype.hasOwnProperty.call(options, 'pendingPveEnrollmentKey')
      ? options.pendingPveEnrollmentKey
      : (previous.pendingPveEnrollmentKey || null),
    pendingIconSource: Object.prototype.hasOwnProperty.call(options, 'pendingIconSource')
      ? options.pendingIconSource
      : (previous.pendingIconSource || null),
    pendingIconPage: Number.isInteger(options.pendingIconPage)
      ? options.pendingIconPage
      : (Number.isInteger(previous.pendingIconPage) ? previous.pendingIconPage : 0),
    pendingScheduleTargetEventId: Object.prototype.hasOwnProperty.call(options, 'pendingScheduleTargetEventId')
      ? options.pendingScheduleTargetEventId
      : (previous.pendingScheduleTargetEventId || null),
    pendingScheduleReturnView: Object.prototype.hasOwnProperty.call(options, 'pendingScheduleReturnView')
      ? options.pendingScheduleReturnView
      : (previous.pendingScheduleReturnView || null),
    pendingActivationEventIds: hasExplicit(options, 'pendingActivationEventIds')
      ? (Array.isArray(options.pendingActivationEventIds) ? options.pendingActivationEventIds.map(String) : null)
      : (Array.isArray(previous.pendingActivationEventIds) ? previous.pendingActivationEventIds : null),
    pendingActivationReturnView: Object.prototype.hasOwnProperty.call(options, 'pendingActivationReturnView')
      ? options.pendingActivationReturnView
      : (previous.pendingActivationReturnView || null),
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
