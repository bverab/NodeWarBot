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
const warService = require('../services/warService');
const { normalizeWar } = require('../utils/warState');
const { buildWarMessagePayload } = require('../utils/warMessageBuilder');

module.exports = async interaction => {
  try {
    if (interaction.customId === 'create_war_initial') {
      return await handleWarCreation(interaction);
    }

    if (interaction.customId === 'add_roles_bulk') {
      return await handleAddRolesBulk(interaction);
    }

    if (interaction.customId === 'add_roles_bulk_modal') {
      return await handleAddRolesBulkModal(interaction);
    }

    if (interaction.customId === 'select_war_day') {
      return await handleSelectDay(interaction);
    }

    if (interaction.customId === 'select_war_time') {
      return await handleSelectTime(interaction);
    }

    if (interaction.customId === 'select_war_mentions') {
      return await handleSelectMentions(interaction);
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

  const groupId = `war_${Date.now()}`;

  // Inicializar datos del evento
  const warData = {
    groupId,
    name,
    type,
    timezone,
    roles: [],
    waitlist: [],
    creatorId: interaction.user.id,
    createdAt: Date.now(),
    channelId: interaction.channelId,
    
    // Scheduling (se llenan después)
    dayOfWeek: null,
    time: '22:00',  // Default
    duration: 70,
    notifyRoles: [],
    
    schedule: {
      enabled: true,
      lastCreatedAt: null
    },
    
    isClosed: false
  };

  if (!global.warEdits) global.warEdits = {};
  global.warEdits[interaction.user.id] = warData;

  // Mostrar selector de día de semana
  await showDaySelector(interaction, warData);
}

/**
 * Muestra selector de día de semana
 */
async function showDaySelector(interaction, warData) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_war_day')
    .setPlaceholder('Selecciona el día para este evento')
    .addOptions(
      dayNames.map((day, index) => ({
        label: day,
        value: String(index),
        description: `Evento para ${day}`
      }))
    );

  const embed = new EmbedBuilder()
    .setTitle(`Configurar: ${warData.name}`)
    .setDescription('**Paso 1: Selecciona día de semana**')
    .setColor(0x5865f2)
    .addFields({
      name: 'Información',
      value: `Nombre: **${warData.name}**\nTipo: ${warData.type}\nZona: ${warData.timezone}`
    });

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

/**
 * PASO 2: Maneja selección de día
 */
async function handleSelectDay(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.update({ content: 'Sesión expirada', components: [] });
  }

  warData.dayOfWeek = Number(interaction.values[0]);
  await interaction.deferUpdate();
  await showTimeModal(interaction);
}

/**
 * Muestra modal para hora y duración
 */
async function showTimeModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('select_war_time')
    .setTitle('Configurar Hora');

  const timeInput = new TextInputBuilder()
    .setCustomId('time_input')
    .setLabel('Hora (HH:mm, ej: 22:00)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5)
    .setValue('22:00');

  const durationInput = new TextInputBuilder()
    .setCustomId('duration_input')
    .setLabel('Duración (minutos)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue('70');

  modal.addComponents(
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(durationInput)
  );

  await interaction.showModal(modal);
}

/**
 * PASO 3: Maneja input de hora y duración
 */
async function handleSelectTime(interaction) {
  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.reply({ content: 'Sesión expirada', flags: 64 });
  }

  const timeStr = interaction.fields.getTextInputValue('time_input').trim();
  const durationStr = interaction.fields.getTextInputValue('duration_input').trim();

  if (!isValidTime(timeStr)) {
    return await interaction.reply({ content: '❌ Hora inválida (usa HH:mm)', flags: 64 });
  }

  const duration = Number(durationStr) || 70;
  if (duration < 1 || duration > 1440) {
    return await interaction.reply({ content: '❌ Duración 1-1440 min', flags: 64 });
  }

  warData.time = timeStr;
  warData.duration = duration;

  await interaction.deferReply({ flags: 64 });
  await showMentionsSelector(interaction, warData);
}

/**
 * Muestra selector de @mentions
 */
async function showMentionsSelector(interaction, warData) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayName = dayNames[warData.dayOfWeek];

  const embed = new EmbedBuilder()
    .setTitle(`Configurar: ${warData.name}`)
    .setDescription('**Paso 2: Notificaciones (opcional)**')
    .setColor(0x5865f2)
    .addFields({
      name: '⏰ Evento',
      value: `${dayName} ${warData.time} (${warData.duration} min)`
    },
    {
      name: '📢 Instrucciones',
      value: 'Selecciona roles para @mencionar cuando se publique'
    });

  try {
    const roles = await interaction.guild.roles.fetch();
    const selectableRoles = roles
      .filter(r => !r.managed && r.id !== interaction.guildId)
      .slice(0, 25);

    if (selectableRoles.size === 0) {
      await showRolesEditor(interaction, warData);
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('select_war_mentions')
      .setPlaceholder('Selecciona roles (opcional)')
      .setMinValues(0)
      .setMaxValues(selectableRoles.size)
      .addOptions(
        selectableRoles.map(role => ({
          label: role.name,
          value: role.id
        }))
      );

    await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  } catch (error) {
    console.warn('Error obteniendo roles:', error);
    await showRolesEditor(interaction, warData);
  }
}

/**
 * Maneja selección de mentions
 */
async function handleSelectMentions(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.update({ content: 'Sesión expirada', components: [] });
  }

  warData.notifyRoles = interaction.values;
  await interaction.deferUpdate();
  await showRolesEditor(interaction, warData);
}

/**
 * Muestra editor de roles
 */
async function showRolesEditor(interaction, warData) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayName = dayNames[warData.dayOfWeek];
  const mentionsText = warData.notifyRoles.length > 0
    ? warData.notifyRoles.map(id => `<@&${id}>`).join(' ')
    : '*(ninguno)*';

  const rolesDisplay = warData.roles.length > 0
    ? warData.roles.map(r => `${r.emoji || '○'} ${r.name} (${r.max})`).join('\n')
    : '*(ninguno)*';

  const embed = new EmbedBuilder()
    .setTitle(`${warData.name} - ${dayName}`)
    .setColor(0x5865f2)
    .addFields(
      { name: '⏰ Horario', value: `${warData.time} (${warData.duration} min)`, inline: true },
      { name: '🌍 Zona', value: warData.timezone, inline: true },
      { name: '📢 Menciones', value: mentionsText, inline: false },
      { name: '👥 Roles', value: rolesDisplay, inline: false }
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
