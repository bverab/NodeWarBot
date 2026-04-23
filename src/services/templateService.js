const repository = require('../db/eventTemplateRepository');
const { normalizeEventType } = require('../constants/eventTypes');

function buildTemplateDraft(template) {
  if (!template) return null;

  return {
    eventType: normalizeEventType(template.eventType),
    type: template.typeDefault || 'Evento de guerra',
    classIconSource: template.classIconSource || 'bot',
    participantDisplayStyle: template.participantDisplayStyle || 'modern',
    timezone: template.timezone || 'America/Bogota',
    time: template.time || null,
    duration: Number.isFinite(template.duration) ? template.duration : 70,
    closeBeforeMinutes: Number.isFinite(template.closeBeforeMinutes) ? template.closeBeforeMinutes : 0,
    roles: Array.isArray(template.roleSlots)
      ? template.roleSlots.map(slot => ({
          name: slot.name,
          max: Number.isFinite(slot.max) ? slot.max : 1,
          emoji: slot.emoji || null,
          emojiSource: slot.emojiSource || null,
          users: [],
          allowedRoleIds: Array.isArray(slot.allowedRoleIds) ? [...slot.allowedRoleIds] : [],
          allowedRoles: Array.isArray(slot.allowedRoles) ? [...slot.allowedRoles] : []
        }))
      : [],
    notifyRoles: Array.isArray(template.notifyTargets) ? [...template.notifyTargets] : []
  };
}

async function listTemplatesByGuild(guildId, options = {}) {
  return await repository.listTemplates({
    guildId,
    eventType: options.eventType ? normalizeEventType(options.eventType) : undefined,
    includeArchived: Boolean(options.includeArchived)
  });
}

async function getTemplateById(guildId, templateId) {
  return await repository.getTemplateById(templateId, guildId);
}

async function findTemplateByIdOrName(guildId, eventType, value) {
  if (!value) return null;

  const byId = await repository.getTemplateById(value, guildId);
  if (byId) {
    return normalizeEventType(byId.eventType) === normalizeEventType(eventType) ? byId : null;
  }

  const byName = await repository.findTemplateByName({ guildId, eventType, name: value });
  return byName;
}

async function findTemplateByName(guildId, eventType, name) {
  return await repository.findTemplateByName({
    guildId,
    eventType: normalizeEventType(eventType),
    name
  });
}

async function createTemplateFromWar(guildId, eventType, name, war) {
  return await repository.createTemplateFromWar({
    guildId,
    eventType,
    name,
    war
  });
}

async function updateTemplateFromWar(guildId, templateId, war, options = {}) {
  return await repository.updateTemplateFromWar({
    guildId,
    templateId,
    war,
    name: options.name || null,
    unarchive: Boolean(options.unarchive)
  });
}

async function archiveTemplate(guildId, templateId, archived = true) {
  return await repository.archiveTemplateById({
    guildId,
    templateId,
    archived
  });
}

module.exports = {
  buildTemplateDraft,
  listTemplatesByGuild,
  getTemplateById,
  findTemplateByIdOrName,
  findTemplateByName,
  createTemplateFromWar,
  updateTemplateFromWar,
  archiveTemplate
};
