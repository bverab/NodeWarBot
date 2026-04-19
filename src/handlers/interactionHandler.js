const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  getDraftWar,
  getScheduleTemp,
  clearDraftSession
} = require('../utils/draftSessionStore');
const { ROLE_PANEL_ACTIONS } = require('./interaction/rolePanelActions');

module.exports = async interaction => {
  const { customId } = interaction;

  try {
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

    const rolePanelHandler = ROLE_PANEL_ACTIONS[customId];
    if (rolePanelHandler) {
      return await rolePanelHandler(interaction);
    }
  } catch (error) {
    console.error('Error en interactionHandler:', error);
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

  if (warData.roles.length === 0) {
    return await interaction.reply({ content: '❌ Agrega al menos 1 rol antes de publicar', flags: 64 });
  }

  await interaction.deferUpdate();

  const { showScheduleModeSelector } = require('./modalHandler');
  await showScheduleModeSelector(interaction, warData);
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
      if (error?.code === 10062 || error?.code === 40060) return;
    }
    return;
  }

  try {
    await interaction.reply({ content: 'Error', flags: 64 });
  } catch (error) {
    if (error?.code === 10062 || error?.code === 40060) return;
  }
}
