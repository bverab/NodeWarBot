const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { isValidTime, normalizeTimeZone, normalizeTimeZoneInfo } = require('../utils/cronHelper');
const { normalizeEventType, getEventTypeMeta } = require('../constants/eventTypes');
const { extractEmojiAndName, parseEmojiInput } = require('../utils/emojiHelper');
const {
  getDraftWar,
  setDraftWar
} = require('../utils/draftSessionStore');
const scheduleFlow = require('./modal/scheduleFlow');
const { EVENT_ADMIN_MODAL_ACTIONS } = require('./modal/eventAdminModalActions');

module.exports = async interaction => {
  try {
    const eventAdminModalHandler = EVENT_ADMIN_MODAL_ACTIONS[interaction.customId];
    if (eventAdminModalHandler) {
      return await eventAdminModalHandler(interaction);
    }

    if (interaction.customId === 'create_war_initial' || interaction.customId.startsWith('create_event_initial:')) {
      return await handleWarCreation(interaction);
    }

    if (interaction.customId === 'add_roles_bulk_modal') {
      return await handleAddRolesBulkModal(interaction);
    }

    if (interaction.customId === 'schedule_war_mode') {
      return await scheduleFlow.handleScheduleWarMode(interaction);
    }

    if (interaction.customId === 'schedule_war_days') {
      return await scheduleFlow.handleScheduleWarDays(interaction);
    }

    if (interaction.customId === 'schedule_war_mentions') {
      return await scheduleFlow.handleScheduleWarMentions(interaction);
    }

    if (interaction.customId === 'panel_edit_name_modal') {
      return await handlePanelEditNameModal(interaction);
    }

    if (interaction.customId === 'panel_edit_slots_modal') {
      return await handlePanelEditSlotsModal(interaction);
    }

    if (interaction.customId === 'panel_edit_icon_modal') {
      return await handlePanelEditIconModal(interaction);
    }

    if (interaction.customId === 'schedule_recap_modal') {
      return await scheduleFlow.handleScheduleRecapModal(interaction);
    }
  } catch (error) {
    console.error('Error en modalHandler:', error);
    await safeRespond(interaction, 'Error procesando el modal');
  }
};

async function handleWarCreation(interaction) {
  const acknowledged = await safeDefer(interaction);
  if (!acknowledged) return;

  const eventType = extractEventTypeFromCustomId(interaction.customId);
  const eventMeta = getEventTypeMeta(eventType);

  const name = interaction.fields.getTextInputValue('war_name_input');
  const type = interaction.fields.getTextInputValue('war_type_input') || eventMeta.defaultDescription;
  const timezoneRaw = interaction.fields.getTextInputValue('war_timezone_input') || 'America/Bogota';
  const timezoneInfo = normalizeTimeZoneInfo(timezoneRaw);
  if (timezoneInfo.source === 'fallback' && timezoneRaw?.trim()) {
    return await safeRespond(
      interaction,
      '\u274C Zona horaria invalida. Usa formato IANA, por ejemplo: America/Santiago, America/Bogota, America/Sao_Paulo.'
    );
  }
  const timezone = normalizeTimeZone(timezoneRaw);
  const timeStr = interaction.fields.getTextInputValue('war_time_input')?.trim() || '22:00';
  const durationRaw = interaction.fields.getTextInputValue('war_duration_input')?.trim() || '70';

  if (!isValidTime(timeStr)) {
    return await safeRespond(interaction, '\u274C Hora invalida. Usa formato HH:mm (ej: 22:00)');
  }

  const [durationPart, closeBeforePart] = durationRaw.split('/').map(value => value?.trim());
  const duration = Number(durationPart);
  const closeBeforeMinutes = closeBeforePart === undefined || closeBeforePart === ''
    ? 0
    : Number(closeBeforePart);
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
    return await safeRespond(interaction, '\u274C Duracion debe ser entre 1 y 1440 minutos');
  }
  if (!Number.isInteger(closeBeforeMinutes) || closeBeforeMinutes < 0 || closeBeforeMinutes >= duration) {
    return await safeRespond(
      interaction,
      '\u274C Cierre de inscripciones invalido. Debe ser 0 o menor que la duracion. Ej: 90/30'
    );
  }

  const groupId = `war_${Date.now()}`;

  const warData = {
    groupId,
    eventType,
    name,
    type,
    timezone,
    time: timeStr,
    duration,
    closeBeforeMinutes,
    roles: [],
    waitlist: [],
    creatorId: interaction.user.id,
    createdAt: Date.now(),
    channelId: interaction.channelId,
    dayOfWeek: null,
    notifyRoles: [],
    schedule: { enabled: true, lastCreatedAt: null },
    recap: { enabled: false, minutesBeforeExpire: 0, messageText: '', threadId: null, lastPostedAt: null },
    isClosed: false
  };

  setDraftWar(interaction.user.id, warData);

  await interaction.editReply({ content: '\u2705 Evento iniciado' });
  await showRolesEditor(interaction, warData);
}

async function showRolesEditor(interaction, warData) {
  const eventMeta = getEventTypeMeta(warData.eventType);
  const rolesDisplay = warData.roles.length > 0
    ? warData.roles.map(r => `${r.emoji || '\u25CB'} ${r.name} (${r.max})`).join('\n')
    : '*(ninguno)*';

  const embed = new EmbedBuilder()
    .setTitle(`\u{1F4CB} ${warData.name} (${eventMeta.label})`)
    .setDescription(warData.type || 'Evento de guerra')
    .setColor(0x5865f2)
    .addFields(
      { name: '\u{1F30D} Zona Horaria', value: warData.timezone, inline: true },
      { name: '\u{1F465} Roles', value: rolesDisplay, inline: false },
      { name: '\u{1F4DD} Pasos', value: '1. Agrega roles aqui\n2. Haz click en **Publicar** para elegir dias y @mentions', inline: false }
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('add_roles_bulk')
      .setLabel('Agregar Roles')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('open_role_panel')
      .setLabel('Editar Roles')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('publish_war')
      .setLabel('Publicar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cancel_war')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );

  if (interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: [buttons] });
  } else {
    await interaction.update({ embeds: [embed], components: [buttons] });
  }
}

async function handleAddRolesBulkModal(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.reply({ content: 'Sesion expirada', flags: 64 });
  }

  const rolesText = interaction.fields.getTextInputValue('roles_text');
  const lines = rolesText.split('\n').map(l => l.trim()).filter(Boolean);

  let added = 0;
  for (const line of lines) {
    const role = parseRoleLine(line, interaction);
    if (role) {
      warData.roles.push(role);
      added++;
    }
  }

  if (added === 0) {
    return await interaction.reply({ content: '\u274C Formato: `Nombre: slots` (ej: Dosa: 3)', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  await showRolesEditor(interaction, warData);
}

function parseRoleLine(line, interaction) {
  const match = line.match(/^(.+?)\s*:\s*(\d+)\s*$/);
  if (!match) return null;

  const leftPart = match[1].trim();
  const max = Number.parseInt(match[2], 10);
  if (!max || max < 1) return null;

  const { emoji, cleanName, emojiSource } = extractEmojiAndName(leftPart, interaction.guild);
  if (!cleanName) return null;

  return {
    name: cleanName,
    max,
    emoji,
    emojiSource,
    users: [],
    allowedRoleIds: [],
    allowedRoles: []
  };
}

async function handlePanelEditNameModal(interaction) {
  const selected = getSelectedRoleContextFromDraft(interaction.user.id);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const newName = interaction.fields.getTextInputValue('panel_edit_name_input')?.trim();
  if (!newName) {
    return await interaction.reply({ content: 'Nombre invalido.', flags: 64 });
  }

  selected.role.name = newName;
  await interaction.reply({ content: `Nombre actualizado: **${newName}**`, flags: 64 });
}

async function handlePanelEditSlotsModal(interaction) {
  const selected = getSelectedRoleContextFromDraft(interaction.user.id);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const raw = interaction.fields.getTextInputValue('panel_edit_slots_input')?.trim();
  const qty = Number.parseInt(raw, 10);
  if (!Number.isInteger(qty) || qty < 1) {
    return await interaction.reply({ content: 'Slots invalidos. Debe ser un numero mayor a 0.', flags: 64 });
  }

  if (selected.role.users.length > qty) {
    return await interaction.reply({
      content: `No puedes bajar a ${qty}, hay ${selected.role.users.length} inscritos en ese rol.`,
      flags: 64
    });
  }

  selected.role.max = qty;
  await interaction.reply({ content: `Slots actualizados: **${selected.role.name}** -> ${qty}`, flags: 64 });
}

async function handlePanelEditIconModal(interaction) {
  const selected = getSelectedRoleContextFromDraft(interaction.user.id);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const value = interaction.fields.getTextInputValue('panel_edit_icon_input')?.trim();
  if (!value) {
    selected.role.emoji = null;
    selected.role.emojiSource = null;
    return await interaction.reply({ content: `Icono removido para **${selected.role.name}**`, flags: 64 });
  }

  const parsed = parseEmojiInput(value, interaction.guild);
  if (!parsed) {
    return await interaction.reply({
      content: 'Icono invalido. Usa emoji unicode o formato <:nombre:id> del servidor.',
      flags: 64
    });
  }

  selected.role.emoji = parsed.emoji;
  selected.role.emojiSource = parsed.emojiSource;
  await interaction.reply({ content: `Icono actualizado para **${selected.role.name}**: ${parsed.emoji}`, flags: 64 });
}

function getSelectedRoleContextFromDraft(userId) {
  const warData = getDraftWar(userId);
  if (!warData || warData.creatorId !== userId) {
    return { ok: false, message: 'Sesion expirada' };
  }

  const selectedIndex = global.warEditSelections?.[userId];
  if (!Number.isInteger(selectedIndex)) {
    return { ok: false, message: 'Primero selecciona un rol en el panel de edicion' };
  }

  const role = warData.roles[selectedIndex];
  if (!role) {
    return { ok: false, message: 'El rol seleccionado ya no existe' };
  }

  return { ok: true, warData, role, roleIndex: selectedIndex };
}

async function safeDefer(interaction) {
  if (interaction.deferred || interaction.replied) return true;

  try {
    await interaction.deferReply({ flags: 64 });
    return true;
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      return true;
    }
    throw error;
  }
}

async function safeRespond(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
      return;
    }
    await interaction.reply({ content, flags: 64 });
  } catch (error) {
    console.warn(`No se pudo responder (${error?.code})`);
  }
}

function extractEventTypeFromCustomId(customId) {
  if (!customId || typeof customId !== 'string') return 'war';
  if (customId === 'create_war_initial') return 'war';
  const [prefix, rawType] = customId.split(':');
  if (prefix !== 'create_event_initial') return 'war';
  return normalizeEventType(rawType);
}

module.exports.showRolesEditor = showRolesEditor;
module.exports.showScheduleModeSelector = scheduleFlow.showScheduleModeSelector;
module.exports.showScheduleDaysSelector = scheduleFlow.showScheduleDaysSelector;
module.exports.showScheduleMentionsSelector = scheduleFlow.showScheduleMentionsSelector;
module.exports.confirmAndPublish = scheduleFlow.confirmAndPublish;
module.exports.showPublishPreview = scheduleFlow.showPublishPreview;
