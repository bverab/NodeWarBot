const { prisma } = require('./client');
const { normalizeEventType } = require('../constants/eventTypes');

async function ensureGuildIfNeeded(tx, guildId) {
  if (!guildId) return;
  await tx.guild.upsert({
    where: { id: String(guildId) },
    update: {},
    create: { id: String(guildId) }
  });
}

function normalizeTemplateName(name) {
  return String(name || '').trim();
}

function normalizeTemplateRecord(template) {
  if (!template) return null;
  return {
    id: template.id,
    guildId: template.guildId,
    name: template.name,
    eventType: normalizeEventType(template.eventType),
    typeDefault: template.typeDefault,
    classIconSource: template.classIconSource,
    participantDisplayStyle: template.participantDisplayStyle,
    timezone: template.timezone,
    time: template.time,
    duration: template.duration,
    closeBeforeMinutes: template.closeBeforeMinutes,
    isArchived: Boolean(template.isArchived),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    roleSlots: (template.roleSlots || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(slot => ({
        name: slot.name,
        max: slot.max,
        position: slot.position,
        emoji: slot.emoji || null,
        emojiSource: slot.emojiSource || null,
        allowedRoleIds: (slot.permissions || []).map(permission => permission.discordRoleId).filter(Boolean),
        allowedRoles: (slot.permissions || []).map(permission => permission.discordRoleName).filter(Boolean)
      })),
    notifyTargets: (template.notifyTargets || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(target => target.targetId)
  };
}

function includeTemplateRelations() {
  return {
    roleSlots: {
      include: {
        permissions: true
      },
      orderBy: { position: 'asc' }
    },
    notifyTargets: {
      orderBy: { position: 'asc' }
    }
  };
}

async function listTemplates({ guildId, eventType, includeArchived = false }) {
  const where = {
    guildId: String(guildId)
  };

  if (eventType) {
    where.eventType = normalizeEventType(eventType);
  }

  if (!includeArchived) {
    where.isArchived = false;
  }

  const templates = await prisma.eventTemplate.findMany({
    where,
    include: includeTemplateRelations(),
    orderBy: [
      { eventType: 'asc' },
      { name: 'asc' }
    ]
  });

  return templates.map(normalizeTemplateRecord);
}

async function getTemplateById(templateId, guildId) {
  const template = await prisma.eventTemplate.findFirst({
    where: {
      id: String(templateId),
      guildId: String(guildId)
    },
    include: includeTemplateRelations()
  });

  return normalizeTemplateRecord(template);
}

async function findTemplateByName({ guildId, eventType, name }) {
  const normalizedName = normalizeTemplateName(name);
  if (!normalizedName) return null;

  const template = await prisma.eventTemplate.findUnique({
    where: {
      guildId_eventType_name: {
        guildId: String(guildId),
        eventType: normalizeEventType(eventType),
        name: normalizedName
      }
    },
    include: includeTemplateRelations()
  });

  return normalizeTemplateRecord(template);
}

async function replaceTemplateChildrenTx(tx, templateId) {
  await tx.eventTemplateRolePermission.deleteMany({
    where: {
      roleSlot: {
        templateId: String(templateId)
      }
    }
  });
  await tx.eventTemplateRoleSlot.deleteMany({
    where: { templateId: String(templateId) }
  });
  await tx.eventTemplateNotifyTarget.deleteMany({
    where: { templateId: String(templateId) }
  });
}

async function fillTemplateChildrenTx(tx, templateId, war) {
  const roles = Array.isArray(war.roles) ? war.roles : [];
  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index];
    const createdRoleSlot = await tx.eventTemplateRoleSlot.create({
      data: {
        templateId: String(templateId),
        position: index,
        name: String(role.name || `Rol ${index + 1}`),
        max: Number.isFinite(role.max) ? role.max : 1,
        emoji: role.emoji || null,
        emojiSource: role.emojiSource || null
      }
    });

    const dedupRoleIds = Array.from(new Set((Array.isArray(role.allowedRoleIds) ? role.allowedRoleIds : []).map(String).filter(Boolean)));
    const dedupRoleNames = Array.from(new Set((Array.isArray(role.allowedRoles) ? role.allowedRoles : []).map(String).filter(Boolean)));

    for (const allowedRoleId of dedupRoleIds) {
      await tx.eventTemplateRolePermission.create({
        data: {
          roleSlotId: createdRoleSlot.id,
          discordRoleId: allowedRoleId,
          discordRoleName: null
        }
      });
    }

    for (const allowedRoleName of dedupRoleNames) {
      await tx.eventTemplateRolePermission.create({
        data: {
          roleSlotId: createdRoleSlot.id,
          discordRoleId: null,
          discordRoleName: allowedRoleName
        }
      });
    }
  }

  const notifyTargets = Array.from(new Set((Array.isArray(war.notifyRoles) ? war.notifyRoles : []).map(String).filter(Boolean)));
  for (let index = 0; index < notifyTargets.length; index += 1) {
    await tx.eventTemplateNotifyTarget.create({
      data: {
        templateId: String(templateId),
        targetId: notifyTargets[index],
        position: index
      }
    });
  }
}

async function createTemplateFromWar({ guildId, eventType, name, war }) {
  const normalizedName = normalizeTemplateName(name);
  if (!normalizedName) {
    throw new Error('Nombre de plantilla invalido.');
  }

  const normalizedEventType = normalizeEventType(eventType);

  const created = await prisma.$transaction(async tx => {
    await ensureGuildIfNeeded(tx, guildId);

    const template = await tx.eventTemplate.create({
      data: {
        guildId: String(guildId),
        name: normalizedName,
        eventType: normalizedEventType,
        typeDefault: String(war.type || ''),
        classIconSource: String(war.classIconSource || 'bot'),
        participantDisplayStyle: String(war.participantDisplayStyle || 'modern'),
        timezone: String(war.timezone || 'America/Bogota'),
        time: war.time ? String(war.time) : null,
        duration: Number.isFinite(war.duration) ? war.duration : 70,
        closeBeforeMinutes: Number.isFinite(war.closeBeforeMinutes) ? war.closeBeforeMinutes : 0
      }
    });

    await fillTemplateChildrenTx(tx, template.id, war);

    return await tx.eventTemplate.findUnique({
      where: { id: template.id },
      include: includeTemplateRelations()
    });
  });

  return normalizeTemplateRecord(created);
}

async function archiveTemplateById({ templateId, guildId, archived = true }) {
  const updated = await prisma.eventTemplate.updateMany({
    where: {
      id: String(templateId),
      guildId: String(guildId)
    },
    data: {
      isArchived: Boolean(archived)
    }
  });

  if (updated.count === 0) return null;
  return await getTemplateById(templateId, guildId);
}

async function updateTemplateFromWar({ templateId, guildId, war, name = null, unarchive = false }) {
  const existing = await prisma.eventTemplate.findFirst({
    where: {
      id: String(templateId),
      guildId: String(guildId)
    },
    select: {
      id: true,
      eventType: true,
      name: true
    }
  });

  if (!existing) return null;

  const updated = await prisma.$transaction(async tx => {
    await tx.eventTemplate.update({
      where: { id: existing.id },
      data: {
        name: name ? normalizeTemplateName(name) : existing.name,
        typeDefault: String(war.type || ''),
        classIconSource: String(war.classIconSource || 'bot'),
        participantDisplayStyle: String(war.participantDisplayStyle || 'modern'),
        timezone: String(war.timezone || 'America/Bogota'),
        time: war.time ? String(war.time) : null,
        duration: Number.isFinite(war.duration) ? war.duration : 70,
        closeBeforeMinutes: Number.isFinite(war.closeBeforeMinutes) ? war.closeBeforeMinutes : 0,
        isArchived: unarchive ? false : undefined
      }
    });

    await replaceTemplateChildrenTx(tx, existing.id);
    await fillTemplateChildrenTx(tx, existing.id, war);

    return await tx.eventTemplate.findUnique({
      where: { id: existing.id },
      include: includeTemplateRelations()
    });
  });

  return normalizeTemplateRecord(updated);
}

module.exports = {
  listTemplates,
  getTemplateById,
  findTemplateByName,
  createTemplateFromWar,
  archiveTemplateById,
  updateTemplateFromWar
};
