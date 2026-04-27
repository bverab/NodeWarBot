const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { normalizeEventType } = require('../constants/eventTypes');
const {
  getDraftWar,
  getScheduleTemp,
  clearDraftSession
} = require('../utils/draftSessionStore');
const { ROLE_PANEL_ACTIONS } = require('./interaction/rolePanelActions');
const { EVENT_ADMIN_PANEL_ACTIONS } = require('./interaction/eventAdminPanelActions');
const { PVE_EVENT_ADMIN_PANEL_ACTIONS } = require('./interaction/pveEventAdminPanelActions');
const { consumeRateLimit, buildInteractionRateKey } = require('../utils/rateLimiter');
const { logError } = require('../utils/appLogger');

module.exports = async interaction => {
  const { customId } = interaction;

  try {
    const rate = consumeRateLimit(buildInteractionRateKey(interaction, 'panel'), {
      windowMs: 3000,
      maxHits: 8
    });
    if (!rate.allowed) {
      return await interaction.reply({
        content: `Accion limitada por spam. Intenta de nuevo en ${Math.ceil(rate.retryAfterMs / 1000)}s.`,
        flags: 64,
        allowedMentions: { parse: [] }
      });
    }

    if (customId === 'add_roles_bulk') return await handleAddRolesBulkButton(interaction);
    if (customId === 'publish_war') return await handlePublishWar(interaction);
    if (customId === 'cancel_war') return await handleCancelWar(interaction);
    if (customId === 'skip_mentions_publish') return await handleSkipMentionsPublish(interaction);
    if (customId === 'confirm_publish') return await handleConfirmPublish(interaction);
    if (customId === 'confirm_schedule_mode') return await handleConfirmScheduleMode(interaction);
    if (customId === 'confirm_schedule_days') return await handleConfirmScheduleDays(interaction);
    if (customId === 'confirm_schedule_mentions') return await handleConfirmScheduleMentions(interaction);
    if (customId === 'configure_recap') return await handleConfigureRecap(interaction);
    if (customId === 'edit_schedule_mode') return await handleEditScheduleMode(interaction);
    if (customId === 'edit_schedule_days') return await handleEditScheduleDays(interaction);
    if (customId === 'edit_schedule_mentions') return await handleEditScheduleMentions(interaction);
    if (customId === 'configure_pve_slots') return await handleConfigurePveSlots(interaction);
    if (customId === 'configure_pve_access') return await handleConfigurePveAccess(interaction);
    if (customId === 'pve_access_mode_select') return await handlePveAccessModeSelect(interaction);
    if (customId === 'pve_access_users_select' || customId === 'pve_access_roles_select') return await handlePveAccessUsersSelect(interaction);
    if (customId === 'pve_access_save') return await handlePveAccessSave(interaction);
    if (customId === 'pve_access_back') return await handlePveAccessBack(interaction);

    const rolePanelHandler = ROLE_PANEL_ACTIONS[customId];
    if (rolePanelHandler) {
      return await rolePanelHandler(interaction);
    }

    const eventPanelHandler = EVENT_ADMIN_PANEL_ACTIONS[customId];
    if (eventPanelHandler) {
      return await eventPanelHandler(interaction);
    }

    const pveEventPanelHandler = PVE_EVENT_ADMIN_PANEL_ACTIONS[customId];
    if (pveEventPanelHandler) {
      return await pveEventPanelHandler(interaction);
    }
  } catch (error) {
    logError('Error en interactionHandler', error, {
      action: 'panel_interaction',
      guildId: interaction.guildId,
      customId,
      userId: interaction.user?.id,
      eventId: interaction.message?.id || null,
      channelId: interaction.channelId
    });
    await safeInteractionErrorResponse(interaction);
  }
};

async function handleAddRolesBulkButton(interaction) {
  const warData = getDraftWar(interaction.user.id);
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

async function handlePublishWar(interaction) {
  const warData = getDraftWar(interaction.user.id);

  if (!warData) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  if (warData.creatorId !== interaction.user.id) {
    return await interaction.reply({ content: '❌ Solo el creador puede publicar', flags: 64 });
  }

  if (normalizeEventType(warData.eventType) === 'pve') {
    if (!Array.isArray(warData.timeSlots) || warData.timeSlots.length === 0) {
      return await interaction.reply({ content: '? Configura al menos 1 horario PvE antes de publicar', flags: 64 });
    }
  } else if (warData.roles.length === 0) {
    return await interaction.reply({ content: '? Agrega al menos 1 rol antes de publicar', flags: 64 });
  }

  await interaction.deferUpdate();

  const { showScheduleModeSelector } = require('./modalHandler');
  await showScheduleModeSelector(interaction, warData);
}

async function handleConfigurePveSlots(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.reply({ content: 'Sesion expirada', flags: 64 });
  }
  if (normalizeEventType(warData.eventType) !== 'pve') {
    return await interaction.reply({ content: 'Esta accion solo aplica a eventos PvE.', flags: 64 });
  }

  const modal = new ModalBuilder()
    .setCustomId('configure_pve_slots_modal')
    .setTitle(`Configurar horarios PvE: ${warData.name}`);

  const timesInput = new TextInputBuilder()
    .setCustomId('pve_slots_times_input')
    .setLabel('Horarios (HH:mm separados por ;)')
    .setPlaceholder('20:00;21:30;23:00')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(300);

  const currentTimes = Array.isArray(warData.timeSlots)
    ? warData.timeSlots.map(slot => slot.time).filter(Boolean).join(';')
    : '';
  if (currentTimes) {
    timesInput.setValue(currentTimes.slice(0, 300));
  }

  const capacityInput = new TextInputBuilder()
    .setCustomId('pve_slots_capacity_input')
    .setLabel('Cupo por horario')
    .setPlaceholder('Ej: 5')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue(String(Number.isInteger(warData.slotCapacity) ? warData.slotCapacity : 5));

  modal.addComponents(
    new ActionRowBuilder().addComponents(timesInput),
    new ActionRowBuilder().addComponents(capacityInput)
  );

  await interaction.showModal(modal);
}

async function handleConfigurePveAccess(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.reply({ content: 'Sesion expirada', flags: 64 });
  }
  if (normalizeEventType(warData.eventType) !== 'pve') {
    return await interaction.reply({ content: 'Esta accion solo aplica a eventos PvE.', flags: 64 });
  }

  const accessMode = String(warData.accessMode || 'OPEN').toUpperCase() === 'RESTRICTED' ? 'RESTRICTED' : 'OPEN';
  const allowedUserIds = Array.isArray(warData.allowedUserIds) ? warData.allowedUserIds : [];
  const selectedText = allowedUserIds.length
    ? allowedUserIds.map(id => `<@${id}>`).join(', ')
    : 'Sin usuarios seleccionados';

  const modeMenu = new StringSelectMenuBuilder()
    .setCustomId('pve_access_mode_select')
    .setPlaceholder('Selecciona el modo de acceso')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      { label: 'Open', value: 'OPEN', default: accessMode === 'OPEN' },
      { label: 'Restricted', value: 'RESTRICTED', default: accessMode === 'RESTRICTED' }
    ]);

  const userPicker = new UserSelectMenuBuilder()
    .setCustomId('pve_access_users_select')
    .setPlaceholder('Usuarios permitidos (solo para Restricted)')
    .setMinValues(0)
    .setMaxValues(25);

  await interaction.update({
    content: `Configurar acceso PvE\nModo actual: **${accessMode}**\nUsuarios permitidos: ${selectedText}`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(modeMenu),
      new ActionRowBuilder().addComponents(userPicker),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('pve_access_save')
          .setLabel('Guardar acceso')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('pve_access_back')
          .setLabel('Volver')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handlePveAccessModeSelect(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', components: [] });
  }
  warData.accessMode = interaction.values?.[0] === 'RESTRICTED' ? 'RESTRICTED' : 'OPEN';
  await handleConfigurePveAccess(interaction);
}

async function handlePveAccessUsersSelect(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', components: [] });
  }
  warData.allowedUserIds = (interaction.values || []).map(String);
  await handleConfigurePveAccess(interaction);
}

async function handlePveAccessSave(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', components: [] });
  }
  const { showDraftEditor } = require('./modalHandler');
  await interaction.deferUpdate();
  await showDraftEditor(interaction, warData, 'Acceso PvE actualizado.');
}

async function handlePveAccessBack(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', components: [] });
  }
  const { showDraftEditor } = require('./modalHandler');
  await interaction.deferUpdate();
  await showDraftEditor(interaction, warData);
}

async function handleCancelWar(interaction) {
  const warData = getDraftWar(interaction.user.id);

  if (warData?.creatorId !== interaction.user.id) {
    return await interaction.reply({ content: 'Solo el creador puede cancelar', flags: 64 });
  }

  clearDraftSession(interaction.user.id);

  await interaction.reply({ content: '❌ Evento cancelado', flags: 64 });
}

async function handleSkipMentionsPublish(interaction) {
  const { showPublishPreview } = require('./modalHandler');
  const warData = getDraftWar(interaction.user.id);
  const scheduleTemp = getScheduleTemp(interaction.user.id);

  if (!warData || !scheduleTemp) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  scheduleTemp.mentions = [];
  await showPublishPreview(interaction, warData, scheduleTemp.days, [], 'update');
}

async function handleConfirmScheduleMode(interaction) {
  const { showScheduleDaysSelector } = require('./modalHandler');
  const warData = getDraftWar(interaction.user.id);
  const scheduleTemp = getScheduleTemp(interaction.user.id);

  if (!warData || !scheduleTemp || !scheduleTemp.mode) {
    return await interaction.reply({ content: '❌ Selecciona primero el modo de programacion.', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleDaysSelector(interaction, warData);
}

async function handleConfirmScheduleDays(interaction) {
  const { showScheduleMentionsSelector } = require('./modalHandler');
  const warData = getDraftWar(interaction.user.id);
  const scheduleTemp = getScheduleTemp(interaction.user.id);

  if (!warData || !scheduleTemp || !Array.isArray(scheduleTemp.days) || scheduleTemp.days.length === 0) {
    return await interaction.reply({ content: '❌ Selecciona al menos un dia.', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleMentionsSelector(interaction, warData, scheduleTemp.days);
}

async function handleConfirmScheduleMentions(interaction) {
  const { showPublishPreview } = require('./modalHandler');
  const warData = getDraftWar(interaction.user.id);
  const scheduleTemp = getScheduleTemp(interaction.user.id);

  if (!warData || !scheduleTemp || !Array.isArray(scheduleTemp.days)) {
    return await interaction.reply({ content: '❌ Sesion expirada', flags: 64 });
  }

  await showPublishPreview(
    interaction,
    warData,
    scheduleTemp.days,
    Array.isArray(scheduleTemp.mentions) ? scheduleTemp.mentions : [],
    'update'
  );
}

async function handleConfigureRecap(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData) {
    return await interaction.reply({ content: '❌ Sesion expirada', flags: 64 });
  }

  const modal = new ModalBuilder()
    .setCustomId('schedule_recap_modal')
    .setTitle(`Configurar hilo final: ${warData.name}`);

  const minutesInput = new TextInputBuilder()
    .setCustomId('recap_minutes_before_expire_input')
    .setLabel('Minutos antes de borrar (0 = desactivar)')
    .setPlaceholder('Ej: 30')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4)
    .setValue(String(Number.isFinite(warData.recap?.minutesBeforeExpire) ? warData.recap.minutesBeforeExpire : 0));

  const textInput = new TextInputBuilder()
    .setCustomId('recap_message_text_input')
    .setLabel('Texto editable del aviso')
    .setPlaceholder('Ej: NodeWar Mediah 1 - Valencia 1')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(250);

  if (warData.recap?.messageText) {
    textInput.setValue(String(warData.recap.messageText).slice(0, 250));
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(minutesInput),
    new ActionRowBuilder().addComponents(textInput)
  );

  await interaction.showModal(modal);
}

async function handleEditScheduleMode(interaction) {
  const { showScheduleModeSelector } = require('./modalHandler');
  const warData = getDraftWar(interaction.user.id);

  if (!warData) {
    return await interaction.reply({ content: '❌ Sesion expirada', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleModeSelector(interaction, warData);
}

async function handleEditScheduleDays(interaction) {
  const { showScheduleDaysSelector } = require('./modalHandler');
  const warData = getDraftWar(interaction.user.id);
  const scheduleTemp = getScheduleTemp(interaction.user.id);

  if (!warData || !scheduleTemp || !scheduleTemp.mode) {
    return await interaction.reply({ content: '❌ Selecciona primero el modo de programacion.', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleDaysSelector(interaction, warData);
}

async function handleEditScheduleMentions(interaction) {
  const { showScheduleMentionsSelector } = require('./modalHandler');
  const warData = getDraftWar(interaction.user.id);
  const scheduleTemp = getScheduleTemp(interaction.user.id);

  if (!warData || !scheduleTemp || !Array.isArray(scheduleTemp.days) || scheduleTemp.days.length === 0) {
    return await interaction.reply({ content: '❌ Selecciona al menos un dia.', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleMentionsSelector(interaction, warData, scheduleTemp.days);
}

async function handleConfirmPublish(interaction) {
  const { confirmAndPublish } = require('./modalHandler');
  const warData = getDraftWar(interaction.user.id);
  const scheduleTemp = getScheduleTemp(interaction.user.id);

  if (!warData || !scheduleTemp || !Array.isArray(scheduleTemp.days)) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  await interaction.deferUpdate();
  await confirmAndPublish(interaction, warData, scheduleTemp.days, scheduleTemp.mentions || []);
}

async function safeInteractionErrorResponse(interaction) {
  if (interaction.replied || interaction.deferred) {
    try {
      await interaction.editReply({ content: 'Error', embeds: [], components: [] });
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) {
        logSuppressedInteractionErrorReply(interaction, error);
        return;
      }
      logError('No se pudo editar reply de error en interactionHandler', error, {
        action: 'panel_error_reply',
        guildId: interaction.guildId,
        userId: interaction.user?.id,
        eventId: interaction.message?.id || null,
        customId: interaction.customId
      });
    }
    return;
  }

  try {
    await interaction.reply({ content: 'Error', flags: 64, allowedMentions: { parse: [] } });
  } catch (error) {
    if (error?.code === 10062 || error?.code === 40060) {
      logSuppressedInteractionErrorReply(interaction, error);
      return;
    }
    logError('No se pudo enviar reply de error en interactionHandler', error, {
      action: 'panel_error_reply',
      guildId: interaction.guildId,
      userId: interaction.user?.id,
      eventId: interaction.message?.id || null,
      customId: interaction.customId
    });
  }
}

function logSuppressedInteractionErrorReply(interaction, error) {
  logError('No se pudo responder error por interaccion vencida/acknowledged', error, {
    action: 'panel_error_reply',
    guildId: interaction.guildId,
    userId: interaction.user?.id,
    eventId: interaction.message?.id || null,
    customId: interaction.customId,
    code: error?.code
  });
}

