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
const { isValidTime } = require('../utils/cronHelper');

module.exports = async interaction => {
  try {
    if (interaction.customId === 'create_war_initial') {
      return await handleWarCreation(interaction);
    }

    if (interaction.customId === 'add_roles_bulk_modal') {
      return await handleAddRolesBulkModal(interaction);
    }

    if (interaction.customId === 'schedule_war_days') {
      return await handleScheduleWarDays(interaction);
    }

    if (interaction.customId === 'schedule_war_mentions') {
      return await handleScheduleWarMentions(interaction);
    }
  } catch (error) {
    console.error('Error en modalHandler:', error);
    await safeRespond(interaction, 'Error procesando el modal');
  }
};

async function handleWarCreation(interaction) {
  const acknowledged = await safeDefer(interaction);
  if (!acknowledged) return;

  const name = interaction.fields.getTextInputValue('war_name_input');
  const type = interaction.fields.getTextInputValue('war_type_input') || 'Evento de guerra';
  const timezone = interaction.fields.getTextInputValue('war_timezone_input') || 'America/Bogota';
  const timeStr = interaction.fields.getTextInputValue('war_time_input')?.trim() || '22:00';
  const durationStr = interaction.fields.getTextInputValue('war_duration_input')?.trim() || '70';

  // Validar hora
  if (!isValidTime(timeStr)) {
    return await safeRespond(interaction, '❌ Hora inválida. Usa formato HH:mm (ej: 22:00)');
  }

  // Validar duración
  const duration = Number(durationStr);
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
    return await safeRespond(interaction, '❌ Duración debe ser entre 1 y 1440 minutos');
  }

  const groupId = `war_${Date.now()}`;

  const warData = {
    groupId,
    name,
    type,
    timezone,
    time: timeStr,
    duration,
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
  const rolesDisplay = warData.roles.length > 0
    ? warData.roles.map(r => `${r.emoji || '○'} ${r.name} (${r.max})`).join('\n')
    : '*(ninguno)*';

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${warData.name}`)
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

  const { emoji, cleanName } = extractEmojiAndName(leftPart, interaction);
  if (!cleanName) return null;

  return {
    name: cleanName,
    max,
    emoji,
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
    return { emoji: customEmojiMatch[1], cleanName: customEmojiMatch[2].trim() };
  }

  const unicodeMatch = text.match(/^(\p{Extended_Pictographic})\s*(.+)$/u);
  if (unicodeMatch) {
    return { emoji: unicodeMatch[1], cleanName: unicodeMatch[2].trim() };
  }

  return { emoji: null, cleanName: text.trim() };
}

/**
 * Mostrar selector de días (llamado desde interactionHandler al hacer click "Publicar")
 */
async function showScheduleDaysSelector(interaction, warData) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const menu = new StringSelectMenuBuilder()
    .setCustomId('schedule_war_days')
    .setPlaceholder('Selecciona el día (o días) para este evento')
    .setMinValues(1)
    .setMaxValues(7)
    .addOptions(
      dayNames.map((day, index) => ({
        label: day,
        value: String(index),
        description: `Ejecutar ${day}s a las ${warData.time}`
      }))
    );

  const embed = new EmbedBuilder()
    .setTitle(`⏰ Configurar horario: ${warData.name}`)
    .setDescription('**Paso 1: Selecciona día(s)**')
    .setColor(0x5865f2)
    .addFields({
      name: 'Información',
      value: `Hora: **${warData.time}**\nDuración: **${warData.duration} min**\nZona: **${warData.timezone}**`
    });

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

module.exports.showScheduleDaysSelector = showScheduleDaysSelector;

/**
 * Maneja selección de días
 */
async function handleScheduleWarDays(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  const selectedDays = interaction.values.map(v => Number(v));
  if (!global.warScheduleTemp) global.warScheduleTemp = {};
  global.warScheduleTemp[interaction.user.id] = { days: selectedDays };

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const daysText = selectedDays.map(d => dayNames[d]).join(', ');

  const embed = new EmbedBuilder()
    .setTitle(`📢 Configurar menciones: ${warData.name}`)
    .setDescription('**Paso 2: Selecciona roles para @mencionar (opcional)**')
    .setColor(0x5865f2)
    .addFields({
      name: 'Programado para',
      value: `${daysText} a las ${warData.time}`
    });

  try {
    const roles = await interaction.guild.roles.fetch();
    const selectableRoles = roles
      .filter(r => !r.managed && r.id !== interaction.guildId)
      .slice(0, 25);

    if (selectableRoles.size === 0) {
      await confirmAndPublish(interaction, warData, selectedDays, []);
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('schedule_war_mentions')
      .setPlaceholder('Roles a @mencionar (puedes elegir múltiples o dejar vacío)')
      .setMinValues(0)
      .setMaxValues(selectableRoles.size)
      .addOptions(
        selectableRoles.map(role => ({
          label: role.name,
          value: role.id
        }))
      );

    const skipButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('skip_mentions_publish')
        .setLabel('Sin menciones → Publicar')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(menu),
        skipButton
      ]
    });
  } catch (error) {
    console.error('Error en handleScheduleWarDays:', error);
    await interaction.reply({ content: '❌ Error al procesar selección', flags: 64 });
  }
}

/**
 * Mostrar selector de mentions
 */
async function showScheduleMentionsSelector(interaction, warData, selectedDays) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const daysText = selectedDays.map(d => dayNames[d]).join(', ');

  const embed = new EmbedBuilder()
    .setTitle(`📢 Configurar menciones: ${warData.name}`)
    .setDescription('**Paso 2: Selecciona roles para @mencionar (opcional)**')
    .setColor(0x5865f2)
    .addFields({
      name: 'Programado para',
      value: `${daysText} a las ${warData.time}`
    });

  try {
    const roles = await interaction.guild.roles.fetch();
    const selectableRoles = roles
      .filter(r => !r.managed && r.id !== interaction.guildId)
      .slice(0, 25);

    if (selectableRoles.size === 0) {
      await confirmAndPublish(interaction, warData, selectedDays, []);
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('schedule_war_mentions')
      .setPlaceholder('Roles a @mencionar (puedes elegir múltiples o dejar vacío)')
      .setMinValues(0)
      .setMaxValues(selectableRoles.size)
      .addOptions(
        selectableRoles.map(role => ({
          label: role.name,
          value: role.id
        }))
      );

    const skipButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('skip_mentions_publish')
        .setLabel('Sin menciones → Publicar')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(menu),
        skipButton
      ]
    });
  } catch (error) {
    console.warn('Error obteniendo roles:', error);
    await confirmAndPublish(interaction, warData, selectedDays, []);
  }
}

/**
 * Maneja selección de mentions
 */
async function handleScheduleWarMentions(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

  if (!warData || !scheduleTemp) {
    return await interaction.update({ content: '❌ Sesión expirada', components: [] });
  }

  await interaction.deferUpdate();
  await confirmAndPublish(interaction, warData, scheduleTemp.days, interaction.values);
}

/**
 * Confirma y publica eventos
 */
async function confirmAndPublish(interaction, warData, selectedDays, mentionRoleIds) {
  const warService = require('../services/warService');
  const { normalizeWar } = require('../utils/warState');
  const { buildWarMessagePayload } = require('../utils/warMessageBuilder');

  if (warData.roles.length === 0) {
    return await interaction.editReply({ content: '❌ Agrega al menos 1 rol antes de publicar', components: [] });
  }

  // Crear evento para cada día seleccionado
  const createdWars = [];
  for (const dayOfWeek of selectedDays) {
    const warToCreate = {
      ...warData,
      dayOfWeek,
      notifyRoles: mentionRoleIds,
      id: `${warData.groupId}_day${dayOfWeek}`,
      messageId: null
    };

    const normalized = normalizeWar(warToCreate);
    
    try {
      const message = await interaction.channel.send({
        ...buildWarMessagePayload(normalized)
      });

      normalized.messageId = message.id;
      warService.createWar(normalized);
      createdWars.push({ dayOfWeek, messageId: message.id });
    } catch (error) {
      console.error(`Error publicando evento para día ${dayOfWeek}:`, error);
    }
  }

  delete global.warEdits[interaction.user.id];
  delete global.warScheduleTemp[interaction.user.id];

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const daysText = selectedDays.map(d => dayNames[d]).join(', ');
  const mentionText = mentionRoleIds.length > 0 
    ? mentionRoleIds.map(id => `<@&${id}>`).join(' ')
    : '(sin menciones)';

  await interaction.editReply({
    content: `✅ **${warData.name}** publicado\n📅 Días: ${daysText}\n⏰ Hora: ${warData.time}\n📢 Menciones: ${mentionText}`,
    components: []
  });
}

module.exports.showScheduleDaysSelector = showScheduleDaysSelector;

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
