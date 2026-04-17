const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { isValidTime, normalizeTimeZone, normalizeTimeZoneInfo } = require('../utils/cronHelper');
const { normalizeEventType, getEventTypeMeta } = require('../constants/eventTypes');

// Handler de modales y menus de configuracion:
// - Creacion inicial del evento (draft)
// - Carga de roles en bloque
// - Programacion (modo, dias, menciones)
// - Modales de edicion de rol
module.exports = async interaction => {
  try {
    if (interaction.customId === 'create_war_initial' || interaction.customId.startsWith('create_event_initial:')) {
      return await handleWarCreation(interaction);
    }

    if (interaction.customId === 'add_roles_bulk_modal') {
      return await handleAddRolesBulkModal(interaction);
    }

    if (interaction.customId === 'schedule_war_mode') {
      return await handleScheduleWarMode(interaction);
    }

    if (interaction.customId === 'schedule_war_days') {
      return await handleScheduleWarDays(interaction);
    }

    if (interaction.customId === 'schedule_war_mentions') {
      return await handleScheduleWarMentions(interaction);
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
      '❌ Zona horaria invalida. Usa formato IANA, por ejemplo: America/Santiago, America/Bogota, America/Sao_Paulo.'
    );
  }
  const timezone = normalizeTimeZone(timezoneRaw);
  const timeStr = interaction.fields.getTextInputValue('war_time_input')?.trim() || '22:00';
  const durationRaw = interaction.fields.getTextInputValue('war_duration_input')?.trim() || '70';

  // Validar hora
  if (!isValidTime(timeStr)) {
    return await safeRespond(interaction, '❌ Hora inválida. Usa formato HH:mm (ej: 22:00)');
  }

  // Validar duración y cierre de inscripciones (formato: "duracion" o "duracion/cierreAntes")
  const [durationPart, closeBeforePart] = durationRaw.split('/').map(value => value?.trim());
  const duration = Number(durationPart);
  const closeBeforeMinutes = closeBeforePart === undefined || closeBeforePart === ''
    ? 0
    : Number(closeBeforePart);
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
    return await safeRespond(interaction, '❌ Duración debe ser entre 1 y 1440 minutos');
  }
  if (!Number.isInteger(closeBeforeMinutes) || closeBeforeMinutes < 0 || closeBeforeMinutes >= duration) {
    return await safeRespond(
      interaction,
      '❌ Cierre de inscripciones inválido. Debe ser 0 o menor que la duración. Ej: 90/30'
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
    isClosed: false
  };

  if (!global.warEdits) global.warEdits = {};
  global.warEdits[interaction.user.id] = warData;

  await interaction.editReply({ content: '✅ Evento iniciado' });
  await showRolesEditor(interaction, warData);
}



/**
 * Muestra editor de roles (panel principal)
 */
async function showRolesEditor(interaction, warData) {
  // Editor principal del draft (paso previo a publicacion programada).
  const eventMeta = getEventTypeMeta(warData.eventType);
  const rolesDisplay = warData.roles.length > 0
    ? warData.roles.map(r => `${r.emoji || '○'} ${r.name} (${r.max})`).join('\n')
    : '*(ninguno)*';

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${warData.name} (${eventMeta.label})`)
    .setDescription(warData.type || 'Evento de guerra')
    .setColor(0x5865f2)
    .addFields(
      { name: '🌍 Zona Horaria', value: warData.timezone, inline: true },
      { name: '👥 Roles', value: rolesDisplay, inline: false },
      { name: '📝 Pasos', value: '1. Agrega roles aquí\n2. Haz click en **Publicar** para elegir días y @mentions', inline: false }
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

/**
 * Maneja agregar roles en bulk
 */
async function handleAddRolesBulk(interaction) {
  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.reply({ content: 'Sesión expirada', flags: 64 });
  }

  const modal = new ModalBuilder()
    .setCustomId('add_roles_bulk_modal')
    .setTitle('Agregar Roles');

  const rolesInput = new TextInputBuilder()
    .setCustomId('roles_text')
    .setLabel('Roles (nombre: slots)')
    .setPlaceholder('Dosa: 3\nTanque: 2\nSoporte: 1')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
  await interaction.showModal(modal);
}

/**
 * Procesa modal de agregar roles
 */
async function handleAddRolesBulkModal(interaction) {
  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.reply({ content: 'Sesión expirada', flags: 64 });
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
    return await interaction.reply({ content: '❌ Formato: `Nombre: slots` (ej: Dosa: 3)', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  await showRolesEditor(interaction, warData);
}

/**
 * Parsea línea de rol
 */
function parseRoleLine(line, interaction) {
  const match = line.match(/^(.+?)\s*:\s*(\d+)\s*$/);
  if (!match) return null;

  const leftPart = match[1].trim();
  const max = Number.parseInt(match[2], 10);
  if (!max || max < 1) return null;

  const { emoji, cleanName, emojiSource } = extractEmojiAndName(leftPart, interaction);
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

/**
 * Extrae emoji y nombre de rol
 */
function extractEmojiAndName(text, interaction) {
  const customEmojiMatch = text.match(/^(<a?:[A-Za-z0-9_]+:\d+>)\s*(.+)$/);
  if (customEmojiMatch) {
    const emojiId = customEmojiMatch[1].match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/)?.[1] || null;
    const isGuildEmoji = emojiId ? Boolean(interaction.guild?.emojis?.cache?.get(emojiId)) : false;
    return {
      emoji: customEmojiMatch[1],
      cleanName: customEmojiMatch[2].trim(),
      emojiSource: isGuildEmoji ? 'guild' : 'custom'
    };
  }

  const unicodeMatch = text.match(/^(\p{Extended_Pictographic})\s*(.+)$/u);
  if (unicodeMatch) {
    return { emoji: unicodeMatch[1], cleanName: unicodeMatch[2].trim(), emojiSource: 'unicode' };
  }

  return { emoji: null, cleanName: text.trim(), emojiSource: null };
}

/**
 * Mostrar selector de días (llamado desde interactionHandler al hacer click "Publicar")
 */
async function showScheduleModeSelector(interaction, warData) {
  // Paso 1: seleccionar si la programacion es recurrente o unica.
  const menu = new StringSelectMenuBuilder()
    .setCustomId('schedule_war_mode')
    .setPlaceholder('Selecciona si el evento se repite o es unico')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      { label: 'Recurrente', value: 'recurring', description: 'Se publica cada semana' },
      { label: 'Unico', value: 'once', description: 'Se publica una sola vez' }
    ]);

  const embed = new EmbedBuilder()
    .setTitle(`? Configurar horario: ${warData.name}`)
    .setDescription('**Paso 1: Tipo de programacion**')
    .setColor(0x5865f2);

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

async function showScheduleDaysSelector(interaction, warData) {
  // Paso 2: seleccionar uno o varios dias segun el modo elegido.
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id] || {};
  const mode = scheduleTemp.mode || 'recurring';
  const selectedDays = Array.isArray(scheduleTemp.days) ? scheduleTemp.days : [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId('schedule_war_days')
    .setPlaceholder(mode === 'once' ? 'Selecciona 1 dia' : 'Selecciona uno o varios dias')
    .setMinValues(1)
    .setMaxValues(mode === 'once' ? 1 : 7)
    .addOptions(
      dayNames.map((day, index) => ({
        label: day,
        value: String(index),
        description: `A las ${warData.time}`,
        default: selectedDays.includes(index)
      }))
    );

  const embed = new EmbedBuilder()
    .setTitle(`? Configurar horario: ${warData.name}`)
    .setDescription('**Paso 2: Selecciona dia(s)**')
    .setColor(0x5865f2)
    .addFields({ name: 'Modo', value: mode === 'once' ? 'Unico' : 'Recurrente' });

  await interaction.editReply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_schedule_days')
          .setLabel('Confirmar dias y continuar')
          .setStyle(ButtonStyle.Primary)
      )
    ]
  });
}

async function handleScheduleWarMode(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.reply({ content: 'Sesion expirada', flags: 64 });
  }

  if (!global.warScheduleTemp) global.warScheduleTemp = {};
  const scheduleTemp = global.warScheduleTemp[interaction.user.id] || {};
  scheduleTemp.mode = interaction.values[0] === 'once' ? 'once' : 'recurring';
  if (scheduleTemp.mode === 'once' && Array.isArray(scheduleTemp.days) && scheduleTemp.days.length > 1) {
    scheduleTemp.days = [scheduleTemp.days[0]];
  }
  global.warScheduleTemp[interaction.user.id] = scheduleTemp;

  await interaction.update({
    content: `Modo seleccionado: **${scheduleTemp.mode === 'once' ? 'Unico' : 'Recurrente'}**\nPresiona **Confirmar y continuar**.`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_schedule_mode')
          .setLabel('Confirmar y continuar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('edit_schedule_mode')
          .setLabel('Volver a editar')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleScheduleWarDays(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.reply({ content: 'Sesion expirada', flags: 64 });
  }

  if (!global.warScheduleTemp) global.warScheduleTemp = {};
  const scheduleTemp = global.warScheduleTemp[interaction.user.id] || {};
  const mode = scheduleTemp.mode || 'recurring';
  const picked = interaction.values.map(v => Number(v));
  scheduleTemp.days = mode === 'once' ? picked.slice(0, 1) : picked;
  global.warScheduleTemp[interaction.user.id] = scheduleTemp;

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const daysText = scheduleTemp.days.map(d => dayNames[d]).join(', ');

  await interaction.update({
    content: `Dias seleccionados: **${daysText}**\nPresiona **Confirmar dias y continuar**.`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_schedule_days')
          .setLabel('Confirmar dias y continuar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('edit_schedule_days')
          .setLabel('Volver a editar')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function showScheduleMentionsSelector(interaction, warData, selectedDays) {
  // Paso 3: seleccionar roles a mencionar al publicar.
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const daysText = selectedDays.map(d => dayNames[d]).join(', ');

  const embed = new EmbedBuilder()
    .setTitle(`?? Configurar menciones: ${warData.name}`)
    .setDescription('**Paso 3: Selecciona roles para @mencionar (opcional)**')
    .setColor(0x5865f2)
    .addFields({ name: 'Programado para', value: `${daysText} a las ${warData.time}` });

  try {
    const roles = await interaction.guild.roles.fetch();
    const selectableRoles = roles
      .filter(r => !r.managed && r.id !== interaction.guildId)
      .map(role => role)
      .slice(0, 25);

    if (selectableRoles.length === 0) {
      return await showPublishPreview(interaction, warData, selectedDays, [], 'editReply');
    }

    const existingMentions = Array.isArray(global.warScheduleTemp?.[interaction.user.id]?.mentions)
      ? global.warScheduleTemp[interaction.user.id].mentions
      : [];

    const menu = new StringSelectMenuBuilder()
      .setCustomId('schedule_war_mentions')
      .setPlaceholder('Selecciona roles a mencionar')
      .setMinValues(0)
      .setMaxValues(selectableRoles.length)
      .addOptions(
        selectableRoles.map(role => ({
          label: role.name,
          value: role.id,
          default: existingMentions.includes(role.id)
        }))
      );

    await interaction.editReply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_schedule_mentions')
            .setLabel('Confirmar menciones')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('skip_mentions_publish')
            .setLabel('Sin menciones')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  } catch (error) {
    console.warn('Error obteniendo roles:', error);
    await showPublishPreview(interaction, warData, selectedDays, [], 'editReply');
  }
}

async function handleScheduleWarMentions(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];
  if (!scheduleTemp) {
    return await interaction.update({ content: 'Sesion expirada', components: [] });
  }

  scheduleTemp.mentions = interaction.values.map(String);
  await interaction.update({
    content: `Menciones seleccionadas: ${scheduleTemp.mentions.length > 0 ? scheduleTemp.mentions.map(id => `<@&${id}>`).join(' ') : '(sin menciones)'}\nPresiona **Confirmar menciones** para continuar.`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_schedule_mentions')
          .setLabel('Confirmar menciones')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('edit_schedule_mentions')
          .setLabel('Volver a editar')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('skip_mentions_publish')
          .setLabel('Sin menciones')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function confirmAndPublish(interaction, warData, selectedDays, mentionRoleIds) {
  // Crea uno o varios eventos persistidos (uno por dia) y limpia sesion de edicion.
  const warService = require('../services/warService');
  const { normalizeWar } = require('../utils/warState');
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id] || {};
  const scheduleMode = scheduleTemp.mode === 'once' ? 'once' : 'recurring';

  if (warData.roles.length === 0) {
    return await finalizeScheduleInteraction(interaction, {
      content: '? Agrega al menos 1 rol antes de publicar',
      components: []
    });
  }

  for (const dayOfWeek of selectedDays) {
    const warToCreate = {
      ...warData,
      dayOfWeek,
      notifyRoles: mentionRoleIds,
      id: `${warData.groupId}_day${dayOfWeek}`,
      messageId: null,
      schedule: {
        ...(warData.schedule || {}),
        mode: scheduleMode
      }
    };

    const normalized = normalizeWar(warToCreate);
    warService.createWar(normalized);
  }

  delete global.warEdits[interaction.user.id];
  delete global.warScheduleTemp[interaction.user.id];

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const daysText = selectedDays.map(d => dayNames[d]).join(', ');
  const mentionText = mentionRoleIds.length > 0
    ? mentionRoleIds.map(id => `<@&${id}>`).join(' ')
    : '(sin menciones)';

  await finalizeScheduleInteraction(interaction, {
    content: `Programacion creada: **${warData.name}**\nDias: ${daysText}\nHora: ${warData.time}\nModo: ${scheduleMode === 'once' ? 'Unico' : 'Recurrente'}\nMenciones al publicar: ${mentionText}`,
    components: []
  });
}

module.exports.showScheduleModeSelector = showScheduleModeSelector;
module.exports.showScheduleDaysSelector = showScheduleDaysSelector;
module.exports.showScheduleMentionsSelector = showScheduleMentionsSelector;
module.exports.confirmAndPublish = confirmAndPublish;
module.exports.showPublishPreview = showPublishPreview;
module.exports.showRolesEditor = showRolesEditor;

async function finalizeScheduleInteraction(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }

  if (interaction.isStringSelectMenu() || interaction.isButton()) {
    await interaction.update(payload);
    return;
  }

  await interaction.reply({ ...payload, flags: 64 });
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

// Vista de confirmacion final antes de publicar la programacion.
async function showPublishPreview(interaction, warData, selectedDays, mentionRoleIds, mode = 'editReply') {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const daysText = selectedDays.map(d => dayNames[d]).join(', ');
  const mentionText = mentionRoleIds.length > 0
    ? mentionRoleIds.map(id => `<@&${id}>`).join(' ')
    : '(sin menciones)';

  const embed = new EmbedBuilder()
    .setTitle(`✅ Confirmar publicación: ${warData.name}`)
    .setDescription('**Paso 3: Revisa y confirma**')
    .setColor(0x57f287)
    .addFields(
      { name: 'Días', value: daysText, inline: false },
      { name: 'Hora / Duración', value: `${warData.time} (${warData.duration} min)`, inline: true },
      { name: 'Cierre inscripciones', value: `${warData.closeBeforeMinutes || 0} min antes de borrar`, inline: true },
      { name: 'Zona', value: warData.timezone, inline: true },
      { name: 'Menciones', value: mentionText, inline: false }
    );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_publish')
      .setLabel('Confirmar y publicar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('edit_schedule_mentions')
      .setLabel('Volver a editar')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cancel_war')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );

  if (mode === 'update' && (interaction.isStringSelectMenu() || interaction.isButton())) {
    await interaction.update({ embeds: [embed], components: [actions] });
    return;
  }

  await interaction.editReply({ embeds: [embed], components: [actions] });
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

  const parsed = parseEmojiInput(value, interaction);
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
  const warData = global.warEdits?.[userId];
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

function parseEmojiInput(text, interaction) {
  const customEmojiMatch = text.match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/);
  if (customEmojiMatch) {
    const emojiId = customEmojiMatch[1];
    const isGuildEmoji = Boolean(interaction.guild?.emojis?.cache?.get(emojiId));

    return {
      emoji: text,
      emojiSource: isGuildEmoji ? 'guild' : 'custom'
    };
  }

  if (/\p{Extended_Pictographic}/u.test(text)) {
    return {
      emoji: text,
      emojiSource: 'unicode'
    };
  }

  return null;
}
