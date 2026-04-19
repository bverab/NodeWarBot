const { PermissionFlagsBits } = require('discord.js');
const { loadWars } = require('../services/warService');
const {
  getSelectedEventContext,
  setSelectedEventContext
} = require('../utils/eventAdminContextStore');
const { getRoleByName, addParticipantToRole, pickWaitlistForRole } = require('../utils/warState');
const { buildWarMessagePayload } = require('../utils/warMessageBuilder');

async function resolveTargetWar(interaction, eventId) {
  if (eventId) {
    const explicit = loadWars().find(war => war.id === String(eventId).trim() && war.channelId === interaction.channelId) || null;
    if (explicit) {
      const defaultScope = explicit.schedule?.mode === 'once' ? 'single' : 'series';
      setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, explicit.id, { scope: defaultScope });
    }
    return explicit;
  }

  const selectedContext = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  if (selectedContext?.eventId) {
    const selected = loadWars().find(war =>
      war.id === String(selectedContext.eventId) && war.channelId === interaction.channelId
    ) || null;
    if (selected) return selected;
  }

  return await resolveActiveWar(interaction);
}

async function resolveActiveWar(interaction) {
  const wars = loadWars()
    .filter(war => war.channelId === interaction.channelId && war.messageId)
    .sort((a, b) => b.createdAt - a.createdAt);

  try {
    const recentMessages = await interaction.channel.messages.fetch({ limit: 100 });
    const orderMap = new Map();
    let pos = 0;
    for (const message of recentMessages.values()) {
      orderMap.set(message.id, pos);
      pos += 1;
    }

    const active = wars
      .filter(war => orderMap.has(war.messageId))
      .sort((a, b) => orderMap.get(a.messageId) - orderMap.get(b.messageId))[0];
    if (active) {
      const defaultScope = active.schedule?.mode === 'once' ? 'single' : 'series';
      setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, active.id, { scope: defaultScope });
      return active;
    }
  } catch (error) {
    console.warn('No se pudieron leer mensajes recientes para resolver evento activo');
  }

  return null;
}

async function refreshWarMessage(interaction, war) {
  try {
    const channel = await interaction.guild.channels.fetch(war.channelId).catch(() => null);
    if (!channel || !channel.messages?.fetch) return false;

    const message = await channel.messages.fetch(war.messageId);
    await message.edit(buildWarMessagePayload(war));
    return true;
  } catch (error) {
    if (error?.code === 10008) return false;
    console.error('Error actualizando mensaje del evento:', error);
    return false;
  }
}

function promoteFromWaitlist(state, roleName) {
  const role = getRoleByName(state, roleName);
  if (!role || role.users.length >= role.max) return null;

  const nextInWaitlist = pickWaitlistForRole(state, role.name);
  if (!nextInWaitlist) return null;

  const promoted = {
    userId: nextInWaitlist.userId,
    displayName: nextInWaitlist.userName,
    isFake: nextInWaitlist.isFake
  };

  addParticipantToRole(role, promoted);
  return { ...promoted, roleName: role.name };
}

function isAdminExecutor(interaction) {
  const hasAdminPermission = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const adminRoleNames = new Set(['admin', 'administrador']);
  const hasAdminRole = Boolean(
    interaction.member?.roles?.cache?.some(role => adminRoleNames.has(String(role.name).toLowerCase().trim()))
  );

  return Boolean(hasAdminPermission || hasAdminRole);
}

module.exports = {
  resolveTargetWar,
  refreshWarMessage,
  promoteFromWaitlist,
  isAdminExecutor
};
