const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { isValidTime, normalizeTimeZone, normalizeTimeZoneInfo } = require('../utils/cronHelper');
const { normalizeEventType, getEventTypeMeta } = require('../constants/eventTypes');
const { extractEmojiAndName, parseEmojiInput } = require('../utils/emojiHelper');
const { sanitizeUserInput, sanitizeDisplayText, safeEmbedTitle, safeEmbedDescription, safeEmbedFieldValue } = require('../utils/textSafety');
const { logError, logWarn, logInfo } = require('../utils/appLogger');
const templateService = require('../services/templateService');
const pveService = require('../services/pveService');
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

    if (interaction.customId === 'configure_pve_slots_modal') {
      return await handleConfigurePveSlotsModal(interaction);
    }
  } catch (error) {
    logError('Error en modalHandler', error, {
      action: 'modal_dispatch',
      customId: interaction.customId,
      guildId: interaction.guildId,
      userId: interaction.user?.id,
      eventId: interaction.message?.id || null
    });
    await safeRespond(interaction, 'Error procesando el modal');
  }
};

async function handleWarCreation(interaction) {
  const acknowledged = await safeDefer(interaction);
  if (!acknowledged) return;

  const createContext = extractCreateEventContextFromCustomId(interaction.customId);
  const eventType = createContext.eventType;
  const eventMeta = getEventTypeMeta(eventType);
  const template = createContext.templateId
    ? await templateService.getTemplateById(interaction.guildId, createContext.templateId)
    : null;
  if (createContext.templateId && (!template || template.isArchived || template.eventType !== eventType)) {
    return await safeRespond(
      interaction,
      '❌ La plantilla seleccionada no esta disponible para este tipo. Vuelve a ejecutar /event create.'
    );
  }
  const templateDraft = template ? templateService.buildTemplateDraft(template) : null;

  const nameInput = sanitizeUserInput(interaction.fields.getTextInputValue('war_name_input'), {
    maxLength: 50,
    fallback: ''
  });
  const typeInput = sanitizeUserInput(
    interaction.fields.getTextInputValue('war_type_input') || templateDraft?.type || eventMeta.defaultDescription,
    {
      maxLength: 100,
      allowEmpty: true
    }
  );
  const timezoneInput = sanitizeUserInput(
    interaction.fields.getTextInputValue('war_timezone_input') || templateDraft?.timezone || 'America/Bogota',
    {
      maxLength: 50,
      fallback: 'America/Bogota'
    }
  );

  const name = nameInput.value;
  const type = typeInput.value || eventMeta.defaultDescription;
  const timezoneRaw = timezoneInput.value || 'America/Bogota';
  if (!name) {
    return await safeRespond(interaction, '❌ Nombre invalido. No puede estar vacio.');
  }

  if (nameInput.hadMassMentions || typeInput.hadMassMentions) {
    logWarn('Se neutralizaron menciones masivas en creacion de evento', {
      userId: interaction.user?.id,
      guildId: interaction.guildId
    });
  }

  const timezoneInfo = normalizeTimeZoneInfo(timezoneRaw);
  if (timezoneInfo.source === 'fallback' && timezoneRaw?.trim()) {
    return await safeRespond(
      interaction,
      '\u274C Zona horaria invalida. Usa formato IANA, por ejemplo: America/Santiago, America/Bogota, America/Sao_Paulo.'
    );
  }
  const timezone = normalizeTimeZone(timezoneRaw);
  const timeStr = sanitizeUserInput(interaction.fields.getTextInputValue('war_time_input'), {
    maxLength: 5,
    fallback: '22:00'
  }).value;
  const durationRaw = sanitizeUserInput(interaction.fields.getTextInputValue('war_duration_input'), {
    maxLength: 9,
    fallback: '70'
  }).value;

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
    classIconSource: templateDraft?.classIconSource || 'bot',
    participantDisplayStyle: templateDraft?.participantDisplayStyle || 'modern',
    timezone,
    time: timeStr,
    duration,
    closeBeforeMinutes,
    roles: templateDraft?.roles ? templateDraft.roles.map(role => ({ ...role })) : [],
    waitlist: [],
    creatorId: interaction.user.id,
    guildId: interaction.guildId,
    createdAt: Date.now(),
    channelId: interaction.channelId,
    dayOfWeek: null,
    notifyRoles: templateDraft?.notifyRoles ? [...templateDraft.notifyRoles] : [],
    schedule: { enabled: true, lastCreatedAt: null },
    recap: { enabled: false, minutesBeforeExpire: 0, messageText: '', threadId: null, lastPostedAt: null },
    isClosed: false,
    timeSlots: [],
    slotCapacity: 5,
    accessMode: 'OPEN',
    allowedUserIds: []
  };

  setDraftWar(interaction.user.id, warData);

  await interaction.editReply({ content: '\u2705 Evento iniciado' });
  await showDraftEditor(interaction, warData);
}

async function showDraftEditor(interaction, warData, notice = '') {
  if (normalizeEventType(warData.eventType) === 'pve') {
    await showPveEditor(interaction, warData, notice);
    return;
  }
  await showRolesEditor(interaction, warData, notice);
}

async function showRolesEditor(interaction, warData, notice = '') {
  const eventMeta = getEventTypeMeta(warData.eventType);
  const rolesDisplay = warData.roles.length > 0
    ? warData.roles.map(r => `${r.emoji || '\u25CB'} ${r.name} (${r.max})`).join('\n')
    : '*(ninguno)*';

  const embed = new EmbedBuilder()
    .setTitle(safeEmbedTitle(`\u{1F4CB} ${warData.name} (${eventMeta.label})`, '📋 Evento'))
    .setDescription(safeEmbedDescription(warData.type || 'Evento de guerra'))
    .setColor(0x5865f2)
    .addFields(
      { name: '\u{1F30D} Zona Horaria', value: safeEmbedFieldValue(warData.timezone, 'Sin zona'), inline: true },
      {
        name: '\u{1F58C}\uFE0F Visual',
        value: safeEmbedFieldValue(`Fuente: ${String(warData.classIconSource || 'bot')}\nEstilo: ${String(warData.participantDisplayStyle || 'modern')}`),
        inline: true
      },
      { name: '\u{1F465} Roles', value: safeEmbedFieldValue(rolesDisplay), inline: false },
      { name: '\u{1F4DD} Pasos', value: safeEmbedFieldValue('1. Agrega roles aqui\n2. Haz click en **Publicar** para elegir dias y @mentions'), inline: false }
    );
  if (notice) {
    embed.addFields({ name: 'Info', value: safeEmbedFieldValue(notice), inline: false });
  }

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
      .setCustomId('panel_visual_settings')
      .setLabel('Visual')
      .setStyle(ButtonStyle.Secondary),
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

async function showPveEditor(interaction, warData, notice = '') {
  const eventMeta = getEventTypeMeta(warData.eventType);
  const slots = Array.isArray(warData.timeSlots) ? warData.timeSlots : [];
  const accessMode = String(warData.accessMode || 'OPEN').toUpperCase() === 'RESTRICTED' ? 'RESTRICTED' : 'OPEN';
  const allowedUserIds = Array.isArray(warData.allowedUserIds) ? warData.allowedUserIds : [];
  const accessText = accessMode === 'RESTRICTED'
    ? (allowedUserIds.length ? allowedUserIds.map(id => `<@${id}>`).join(', ') : 'Restringido (sin usuarios)')
    : 'Open';
  const slotDisplay = slots.length
    ? slots.map(slot => `⏰ ${slot.time} (${slot.capacity})`).join('\n')
    : '*(ninguno)*';

  const embed = new EmbedBuilder()
    .setTitle(safeEmbedTitle(`🧭 ${warData.name} (${eventMeta.label})`, '🧭 Evento PvE'))
    .setDescription(safeEmbedDescription(warData.type || 'Evento PvE'))
    .setColor(0x2ecc71)
    .addFields(
      { name: '🌍 Zona Horaria', value: safeEmbedFieldValue(warData.timezone, 'Sin zona'), inline: true },
      { name: '🕒 Publicacion', value: safeEmbedFieldValue(`${warData.time} (${warData.duration} min)`), inline: true },
      { name: '🔐 Acceso', value: safeEmbedFieldValue(accessText), inline: false },
      { name: '⏰ Horarios', value: safeEmbedFieldValue(slotDisplay), inline: false },
      { name: '📝 Pasos', value: safeEmbedFieldValue('1. Configura horarios y cupo\n2. Haz click en **Publicar** para elegir dias y @mentions'), inline: false }
    );

  if (notice) {
    embed.addFields({ name: 'Info', value: safeEmbedFieldValue(notice), inline: false });
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('configure_pve_slots')
      .setLabel('Configurar Horarios')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('configure_pve_access')
      .setLabel('Configurar Acceso')
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

  const rolesText = sanitizeUserInput(interaction.fields.getTextInputValue('roles_text'), {
    maxLength: 1500,
    fallback: ''
  }).value;
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

async function handleConfigurePveSlotsModal(interaction) {
  const acknowledged = await safeDefer(interaction);
  if (!acknowledged) return;

  const warData = getDraftWar(interaction.user.id);
  if (!warData || warData.creatorId !== interaction.user.id) {
    return await safeRespond(interaction, 'Sesion expirada');
  }

  if (normalizeEventType(warData.eventType) !== 'pve') {
    return await safeRespond(interaction, 'Esta accion solo aplica a eventos PvE.');
  }

  const rawTimes = interaction.fields.getTextInputValue('pve_slots_times_input') || '';
  const rawCapacity = interaction.fields.getTextInputValue('pve_slots_capacity_input') || '';

  let parsed;
  try {
    parsed = pveService.parsePveSlotsInput(rawTimes, rawCapacity);
  } catch (error) {
    return await safeRespond(interaction, `❌ ${error.message}`);
  }

  warData.timeSlots = parsed.timeSlots;
  warData.slotCapacity = parsed.slotCapacity;

  await showPveEditor(interaction, warData, `Horarios configurados: ${warData.timeSlots.length}`);
}

function parseRoleLine(line, interaction) {
  const match = line.match(/^(.+?)\s*:\s*(\d+)\s*$/);
  if (!match) return null;

  const leftPart = sanitizeUserInput(match[1], {
    maxLength: 60,
    fallback: ''
  }).value;
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

  const { value: newName, hadMassMentions } = sanitizeUserInput(interaction.fields.getTextInputValue('panel_edit_name_input'), {
    maxLength: 60,
    fallback: ''
  });
  if (!newName) {
    return await interaction.reply({ content: 'Nombre invalido.', flags: 64 });
  }
  if (hadMassMentions) {
    logInfo('Se neutralizo mention masiva en rename de rol', { userId: interaction.user?.id });
  }

  selected.role.name = newName;
  await interaction.reply({ content: `Nombre actualizado: **${newName}**`, flags: 64 });
}

async function handlePanelEditSlotsModal(interaction) {
  const selected = getSelectedRoleContextFromDraft(interaction.user.id);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const raw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_edit_slots_input'), {
    maxLength: 4,
    fallback: ''
  }).value;
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

  const value = sanitizeUserInput(interaction.fields.getTextInputValue('panel_edit_icon_input'), {
    maxLength: 80,
    allowEmpty: true
  }).value;
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
    await interaction.reply({ content, flags: 64, allowedMentions: { parse: [] } });
  } catch (error) {
    logWarn('No se pudo responder en modalHandler', {
      action: 'modal_error_reply',
      code: error?.code,
      customId: interaction.customId,
      guildId: interaction.guildId,
      userId: interaction.user?.id,
      eventId: interaction.message?.id || null
    });
  }
}

function extractCreateEventContextFromCustomId(customId) {
  if (!customId || typeof customId !== 'string') {
    return { eventType: 'war', templateId: null };
  }
  if (customId === 'create_war_initial') {
    return { eventType: 'war', templateId: null };
  }

  const [prefix, rawType, rawTemplateId] = customId.split(':');
  if (prefix !== 'create_event_initial') {
    return { eventType: 'war', templateId: null };
  }

  return {
    eventType: normalizeEventType(rawType),
    templateId: rawTemplateId ? String(rawTemplateId).trim() : null
  };
}

module.exports.showRolesEditor = showRolesEditor;
module.exports.showDraftEditor = showDraftEditor;
module.exports.showScheduleModeSelector = scheduleFlow.showScheduleModeSelector;
module.exports.showScheduleDaysSelector = scheduleFlow.showScheduleDaysSelector;
module.exports.showScheduleMentionsSelector = scheduleFlow.showScheduleMentionsSelector;
module.exports.confirmAndPublish = scheduleFlow.confirmAndPublish;
module.exports.showPublishPreview = scheduleFlow.showPublishPreview;
