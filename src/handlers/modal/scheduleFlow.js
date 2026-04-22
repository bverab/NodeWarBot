const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const {
  getDraftWar,
  getScheduleTemp,
  setScheduleTemp,
  clearDraftSession
} = require('../../utils/draftSessionStore');

async function showScheduleModeSelector(interaction, warData) {
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
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const scheduleTemp = getScheduleTemp(interaction.user.id) || {};
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

  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.reply({ content: 'Sesion expirada', flags: 64 });
  }

  const scheduleTemp = getScheduleTemp(interaction.user.id) || {};
  scheduleTemp.mode = interaction.values[0] === 'once' ? 'once' : 'recurring';
  if (scheduleTemp.mode === 'once' && Array.isArray(scheduleTemp.days) && scheduleTemp.days.length > 1) {
    scheduleTemp.days = [scheduleTemp.days[0]];
  }
  setScheduleTemp(interaction.user.id, scheduleTemp);

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

  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.reply({ content: 'Sesion expirada', flags: 64 });
  }

  const scheduleTemp = getScheduleTemp(interaction.user.id) || {};
  const mode = scheduleTemp.mode || 'recurring';
  const picked = interaction.values.map(v => Number(v));
  scheduleTemp.days = mode === 'once' ? picked.slice(0, 1) : picked;
  setScheduleTemp(interaction.user.id, scheduleTemp);

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

    const existingMentions = Array.isArray(getScheduleTemp(interaction.user.id)?.mentions)
      ? getScheduleTemp(interaction.user.id).mentions
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

  const scheduleTemp = getScheduleTemp(interaction.user.id);
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

async function handleScheduleRecapModal(interaction) {
  const acknowledged = await safeDefer(interaction);
  if (!acknowledged) return;

  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.editReply({ content: 'Sesion expirada', embeds: [], components: [] });
  }

  const minutesRaw = interaction.fields.getTextInputValue('recap_minutes_before_expire_input')?.trim() || '0';
  const textRaw = interaction.fields.getTextInputValue('recap_message_text_input')?.trim() || '';

  const minutesBeforeExpire = Number(minutesRaw);
  if (!Number.isInteger(minutesBeforeExpire) || minutesBeforeExpire < 0 || minutesBeforeExpire > 1440) {
    return await interaction.editReply({
      content: 'Minutos invalidos. Debe ser un numero entre 0 y 1440.',
      embeds: [],
      components: []
    });
  }

  if (!warData.recap) {
    warData.recap = { enabled: false, minutesBeforeExpire: 0, messageText: '', threadId: null, lastPostedAt: null };
  }

  warData.recap.enabled = minutesBeforeExpire > 0 || textRaw.length > 0;
  warData.recap.minutesBeforeExpire = minutesBeforeExpire;
  warData.recap.messageText = textRaw;

  const scheduleTemp = getScheduleTemp(interaction.user.id) || {};
  const selectedDays = Array.isArray(scheduleTemp.days) ? scheduleTemp.days : [];
  const mentions = Array.isArray(scheduleTemp.mentions) ? scheduleTemp.mentions : [];

  await showPublishPreview(interaction, warData, selectedDays, mentions, 'editReply');
}

async function confirmAndPublish(interaction, warData, selectedDays, mentionRoleIds) {
  const warService = require('../../services/warService');
  const { normalizeWar } = require('../../utils/warState');
  const scheduleTemp = getScheduleTemp(interaction.user.id) || {};
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
      },
      recap: {
        enabled: Boolean(warData.recap?.enabled),
        minutesBeforeExpire: Number.isFinite(warData.recap?.minutesBeforeExpire) ? warData.recap.minutesBeforeExpire : 0,
        messageText: String(warData.recap?.messageText || ''),
        threadId: null,
        lastPostedAt: null
      }
    };

    const normalized = normalizeWar(warToCreate);
    await warService.createWar(normalized);
  }

  clearDraftSession(interaction.user.id);

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

async function showPublishPreview(interaction, warData, selectedDays, mentionRoleIds, mode = 'editReply') {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const daysText = selectedDays.map(d => dayNames[d]).join(', ');
  const mentionText = mentionRoleIds.length > 0
    ? mentionRoleIds.map(id => `<@&${id}>`).join(' ')
    : '(sin menciones)';
  const recapEnabled = Boolean(warData.recap?.enabled);
  const recapMinutes = Number.isFinite(warData.recap?.minutesBeforeExpire) ? warData.recap.minutesBeforeExpire : 0;
  const recapMessage = String(warData.recap?.messageText || '').trim();
  const recapText = recapEnabled
    ? `Activado (${recapMinutes} min antes de borrar)\nTexto: ${recapMessage || '(sin texto personalizado)'}`
    : 'Desactivado';

  const embed = new EmbedBuilder()
    .setTitle(`\u2705 Confirmar publicacion: ${warData.name}`)
    .setDescription('**Paso 3: Revisa y confirma**')
    .setColor(0x57f287)
    .addFields(
      { name: 'Dias', value: daysText, inline: false },
      { name: 'Hora / Duracion', value: `${warData.time} (${warData.duration} min)`, inline: true },
      { name: 'Cierre inscripciones', value: `${warData.closeBeforeMinutes || 0} min antes de borrar`, inline: true },
      { name: 'Zona', value: warData.timezone, inline: true },
      { name: 'Menciones', value: mentionText, inline: false },
      { name: 'Hilo de resumen', value: recapText, inline: false }
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
      .setCustomId('configure_recap')
      .setLabel('Configurar hilo final')
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

module.exports = {
  showScheduleModeSelector,
  showScheduleDaysSelector,
  handleScheduleWarMode,
  handleScheduleWarDays,
  showScheduleMentionsSelector,
  handleScheduleWarMentions,
  handleScheduleRecapModal,
  confirmAndPublish,
  showPublishPreview
};

