const { normalizeEventType } = require('../constants/eventTypes');
const { buildWarMessagePayload, buildWarReadOnlyPayload, buildWarListText } = require('../utils/warMessageBuilder');
const { buildPveMessagePayload, buildPveReadOnlyPayload, buildPveListText } = require('../utils/pveMessageBuilder');
const pveService = require('./pveService');
const { safeMessageContent } = require('../utils/textSafety');

async function buildEventMessagePayload(event) {
  if (normalizeEventType(event.eventType) === 'pve') {
    const view = await pveService.getEventPveView(event);
    return buildPveMessagePayload(event, view);
  }
  return buildWarMessagePayload(event);
}

async function buildEventReadOnlyPayload(event) {
  if (normalizeEventType(event.eventType) === 'pve') {
    const view = await pveService.getEventPveView(event);
    return buildPveReadOnlyPayload(event, view);
  }
  return buildWarReadOnlyPayload(event);
}

async function buildEventListText(event) {
  if (normalizeEventType(event.eventType) === 'pve') {
    const view = await pveService.getEventPveView(event);
    return safeMessageContent(buildPveListText(event, view), 'Sin datos para mostrar');
  }
  return safeMessageContent(buildWarListText(event), 'Sin datos para mostrar');
}

async function getEventMentionableUserIds(event) {
  if (normalizeEventType(event.eventType) === 'pve') {
    const view = await pveService.getEventPveView(event);
    const options = Array.isArray(view.options) ? view.options : [];
    return Array.from(new Set(
      [
        ...options.flatMap(option => option.enrollments || []),
        ...options.flatMap(option => option.fillers || [])
      ]
        .filter(entry => entry && !entry.isFake && entry.userId)
        .map(entry => String(entry.userId))
    ));
  }

  return Array.from(new Set(
    event.roles
      .flatMap(role => Array.isArray(role.users) ? role.users : [])
      .filter(user => user && !user.isFake && user.userId)
      .map(user => String(user.userId))
  ));
}

module.exports = {
  buildEventMessagePayload,
  buildEventReadOnlyPayload,
  buildEventListText,
  getEventMentionableUserIds
};
