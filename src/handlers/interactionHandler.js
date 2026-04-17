const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

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
    if (customId === 'edit_schedule_mode') return await handleEditScheduleMode(interaction);
    if (customId === 'edit_schedule_days') return await handleEditScheduleDays(interaction);
    if (customId === 'edit_schedule_mentions') return await handleEditScheduleMentions(interaction);

    if (customId === 'open_role_panel') return await handleOpenRolePanel(interaction);
    if (customId === 'panel_back_to_roles') return await handleOpenRolePanel(interaction);
    if (customId === 'panel_back_to_editor') return await handleBackToEditor(interaction);
    if (customId === 'panel_select_role') return await handlePanelSelectRole(interaction);
    if (customId === 'panel_back_to_role') return await handleBackToRole(interaction);
    if (customId === 'panel_edit_name') return await handlePanelEditName(interaction);
    if (customId === 'panel_edit_slots') return await handlePanelEditSlots(interaction);
    if (customId === 'panel_edit_icon') return await handlePanelEditIcon(interaction);
    if (customId === 'panel_edit_permissions') return await handleOpenEditPermissions(interaction);
    if (customId === 'panel_set_permissions') return await handlePanelSetPermissions(interaction);
    if (customId === 'panel_confirm_permissions') return await handlePanelConfirmPermissions(interaction);
    if (customId === 'panel_clear_permissions') return await handlePanelClearPermissions(interaction);
    if (customId === 'panel_set_icon') return await handlePanelSetIcon(interaction);
    if (customId === 'panel_confirm_icon') return await handlePanelConfirmIcon(interaction);
    if (customId === 'panel_open_icon_modal') return await handlePanelOpenIconModal(interaction);
    if (customId === 'panel_clear_icon') return await handlePanelClearIcon(interaction);
    if (customId === 'panel_delete_role') return await handlePanelDeleteRole(interaction);
  } catch (error) {
    console.error('Error en interactionHandler:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Error', flags: 64 });
    }
  }
};

async function handleAddRolesBulkButton(interaction) {
  // Este botón es manejado por modalHandler que muestra un modal
  // El modal submit va de vuelta a modalHandler con customId 'add_roles_bulk_modal'
  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.reply({ content: 'Sesión expirada', flags: 64 });
  }

  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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
  const warData = global.warEdits?.[interaction.user.id];

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
  const warData = global.warEdits?.[interaction.user.id];

  if (warData?.creatorId !== interaction.user.id) {
    return await interaction.reply({ content: 'Solo el creador puede cancelar', flags: 64 });
  }

  delete global.warEdits[interaction.user.id];
  if (global.warEditSelections) {
    delete global.warEditSelections[interaction.user.id];
  }
  if (global.warScheduleTemp) {
    delete global.warScheduleTemp[interaction.user.id];
  }

  await interaction.reply({ content: '❌ Evento cancelado', flags: 64 });
}

async function handleSkipMentionsPublish(interaction) {
  const { showPublishPreview } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

  if (!warData || !scheduleTemp) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  scheduleTemp.mentions = [];
  await showPublishPreview(interaction, warData, scheduleTemp.days, [], 'update');
}

async function handleConfirmScheduleMode(interaction) {
  const { showScheduleDaysSelector } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

  if (!warData || !scheduleTemp || !scheduleTemp.mode) {
    return await interaction.reply({ content: '❌ Selecciona primero el modo de programacion.', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleDaysSelector(interaction, warData);
}

async function handleConfirmScheduleDays(interaction) {
  const { showScheduleMentionsSelector } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

  if (!warData || !scheduleTemp || !Array.isArray(scheduleTemp.days) || scheduleTemp.days.length === 0) {
    return await interaction.reply({ content: '❌ Selecciona al menos un dia.', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleMentionsSelector(interaction, warData, scheduleTemp.days);
}

async function handleConfirmScheduleMentions(interaction) {
  const { showPublishPreview } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

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

async function handleEditScheduleMode(interaction) {
  const { showScheduleModeSelector } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];

  if (!warData) {
    return await interaction.reply({ content: '❌ Sesion expirada', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleModeSelector(interaction, warData);
}

async function handleEditScheduleDays(interaction) {
  const { showScheduleDaysSelector } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

  if (!warData || !scheduleTemp || !scheduleTemp.mode) {
    return await interaction.reply({ content: '❌ Selecciona primero el modo de programacion.', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleDaysSelector(interaction, warData);
}

async function handleEditScheduleMentions(interaction) {
  const { showScheduleMentionsSelector } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

  if (!warData || !scheduleTemp || !Array.isArray(scheduleTemp.days) || scheduleTemp.days.length === 0) {
    return await interaction.reply({ content: '❌ Selecciona al menos un dia.', flags: 64 });
  }

  await interaction.deferUpdate();
  await showScheduleMentionsSelector(interaction, warData, scheduleTemp.days);
}

async function handleConfirmPublish(interaction) {
  const { confirmAndPublish } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

  if (!warData || !scheduleTemp || !Array.isArray(scheduleTemp.days)) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  await interaction.deferUpdate();
  await confirmAndPublish(interaction, warData, scheduleTemp.days, scheduleTemp.mentions || []);
}

async function handleOpenRolePanel(interaction) {
  const warData = getEditableWarForUser(interaction);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', embeds: [], components: [] });
  }

  if (!warData.roles.length) {
    return await interaction.update({ content: 'Agrega roles primero', embeds: [], components: [] });
  }

  await interaction.update(buildRoleSelectionPayload(warData));
}

async function handlePanelSelectRole(interaction) {
  const warData = getEditableWarForUser(interaction);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', components: [] });
  }

  const roleIndex = Number.parseInt(interaction.values[0], 10);
  const role = warData.roles[roleIndex];
  if (!role) {
    return await interaction.update({ content: 'Rol invalido', components: [] });
  }

  setSelectedRoleIndex(interaction.user.id, roleIndex);
  await interaction.update(buildRolePanelPayload(role));
}

async function handleBackToEditor(interaction) {
  const { showRolesEditor } = require('./modalHandler');
  const warData = getEditableWarForUser(interaction);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', embeds: [], components: [] });
  }

  await showRolesEditor(interaction, warData);
}

async function handleBackToRole(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, embeds: [], components: [] });
  }

  await interaction.update(buildRolePanelPayload(selected.role));
}

async function handlePanelEditName(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const modal = new ModalBuilder()
    .setCustomId('panel_edit_name_modal')
    .setTitle(`Editar nombre: ${selected.role.name}`);

  const input = new TextInputBuilder()
    .setCustomId('panel_edit_name_input')
    .setLabel('Nuevo nombre')
    .setValue(selected.role.name)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handlePanelEditSlots(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const modal = new ModalBuilder()
    .setCustomId('panel_edit_slots_modal')
    .setTitle(`Editar slots: ${selected.role.name}`);

  const input = new TextInputBuilder()
    .setCustomId('panel_edit_slots_input')
    .setLabel('Cantidad de slots')
    .setPlaceholder('Ej: 5')
    .setValue(String(selected.role.max))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handlePanelEditIcon(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, embeds: [], components: [] });
  }

  const emojis = await interaction.guild.emojis.fetch().catch(() => null);
  const emojiList = emojis
    ? Array.from(emojis.values()).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 25)
    : [];

  const components = [];
  if (emojiList.length > 0) {
    const iconMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_set_icon')
      .setPlaceholder('Selecciona un emoji del servidor')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        emojiList.map(emoji => ({
          label: emoji.name.slice(0, 100),
          value: String(emoji.id),
          emoji: { id: emoji.id, name: emoji.name, animated: emoji.animated }
        }))
      );

    components.push(new ActionRowBuilder().addComponents(iconMenu));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_open_icon_modal')
        .setLabel('Escribir icono')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_clear_icon')
        .setLabel('Quitar icono')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_back_to_role')
        .setLabel('Volver al rol')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_back_to_roles')
        .setLabel('Volver a roles')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  await interaction.update({
    content: emojiList.length > 0
      ? `Iconos para **${selected.role.name}**`
      : `No hay emojis del servidor disponibles. Usa "Escribir icono" para **${selected.role.name}**`,
    embeds: [],
    components
  });
}

async function handlePanelSetIcon(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, components: [] });
  }

  const emojiId = interaction.values[0];
  const emoji = interaction.guild.emojis.cache.get(emojiId);
  if (!emoji) {
    return await interaction.update({ content: 'Emoji invalido o no disponible.', components: [] });
  }

  const pending = getPendingState(interaction.user.id);
  pending.icon = {
    emoji: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
    emojiSource: 'guild'
  };

  await interaction.update({
    content: `Icono pendiente para **${selected.role.name}**: <${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_confirm_icon')
          .setLabel('Confirmar icono')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_edit_icon')
          .setLabel('Volver a editar')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_clear_icon')
          .setLabel('Quitar icono')
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_role')
          .setLabel('Volver al rol')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_back_to_roles')
          .setLabel('Volver a roles')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handlePanelConfirmIcon(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, components: [] });
  }

  const pending = getPendingState(interaction.user.id);
  if (!pending.icon) {
    return await interaction.update({ content: 'No hay icono pendiente por confirmar.', components: [] });
  }

  selected.role.emoji = pending.icon.emoji;
  selected.role.emojiSource = pending.icon.emojiSource;
  pending.icon = null;

  await interaction.update({
    content: `Icono actualizado para **${selected.role.name}**: ${selected.role.emoji}`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_role')
          .setLabel('Volver al rol')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_back_to_roles')
          .setLabel('Volver a roles')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handlePanelOpenIconModal(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const modal = new ModalBuilder()
    .setCustomId('panel_edit_icon_modal')
    .setTitle(`Editar icono: ${selected.role.name}`);

  const input = new TextInputBuilder()
    .setCustomId('panel_edit_icon_input')
    .setLabel('Emoji unicode o <:nombre:id>')
    .setPlaceholder('Ej: <:caller:123456789012345678> o 🛡️')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);

  if (selected.role.emoji) {
    input.setValue(String(selected.role.emoji).slice(0, 80));
  }

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handlePanelClearIcon(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, components: [] });
  }

  selected.role.emoji = null;
  selected.role.emojiSource = null;
  await interaction.update({
    content: `Icono removido para **${selected.role.name}**`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_role')
          .setLabel('Volver al rol')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_back_to_roles')
          .setLabel('Volver a roles')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleOpenEditPermissions(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, embeds: [], components: [] });
  }

  const currentText = selected.role.allowedRoleIds?.length
    ? selected.role.allowedRoleIds.map(roleId => `<@&${roleId}>`).join(', ')
    : 'Sin restriccion';

  await interaction.update({
    content: `Permisos para **${selected.role.name}**\nActual: ${currentText}`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('panel_set_permissions')
          .setPlaceholder('Selecciona roles de Discord permitidos')
          .setMinValues(0)
          .setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_clear_permissions')
          .setLabel('Quitar Restricciones')
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_role')
          .setLabel('Volver al rol')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_back_to_roles')
          .setLabel('Volver a roles')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handlePanelSetPermissions(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, components: [] });
  }

  const selectedIds = interaction.values.map(String);
  const pending = getPendingState(interaction.user.id);
  pending.permissionIds = selectedIds;

  const linkedText = selectedIds.length
    ? selectedIds.map(roleId => `<@&${roleId}>`).join(', ')
    : 'Sin restriccion';

  await interaction.update({
    content: `Permisos pendientes para **${selected.role.name}**\nSeleccionados: ${linkedText}`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_confirm_permissions')
          .setLabel('Confirmar permisos')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_edit_permissions')
          .setLabel('Volver a editar')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_clear_permissions')
          .setLabel('Quitar Restricciones')
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_role')
          .setLabel('Volver al rol')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_back_to_roles')
          .setLabel('Volver a roles')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handlePanelConfirmPermissions(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, components: [] });
  }

  const pending = getPendingState(interaction.user.id);
  const selectedIds = Array.isArray(pending.permissionIds) ? pending.permissionIds : [];
  selected.role.allowedRoleIds = selectedIds;
  selected.role.allowedRoles = selectedIds
    .map(roleId => interaction.guild?.roles.cache.get(roleId)?.name)
    .filter(Boolean);
  pending.permissionIds = null;

  const linkedText = selectedIds.length
    ? selectedIds.map(roleId => `<@&${roleId}>`).join(', ')
    : 'Sin restriccion';

  await interaction.update({
    content: `Permisos guardados para **${selected.role.name}**\nPermitidos: ${linkedText}`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_role')
          .setLabel('Volver al rol')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_back_to_roles')
          .setLabel('Volver a roles')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handlePanelClearPermissions(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, components: [] });
  }

  selected.role.allowedRoleIds = [];
  selected.role.allowedRoles = [];

  await interaction.update({
    content: `Restricciones removidas para **${selected.role.name}**`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_role')
          .setLabel('Volver al rol')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_back_to_roles')
          .setLabel('Volver a roles')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handlePanelDeleteRole(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, embeds: [], components: [] });
  }

  const removed = selected.warData.roles.splice(selected.roleIndex, 1)[0];

  clearSelectedRoleIndex(interaction.user.id);
  if (!selected.warData.roles.length) {
    const { showRolesEditor } = require('./modalHandler');
    await showRolesEditor(interaction, selected.warData);
    return;
  }

  await interaction.update({
    ...buildRoleSelectionPayload(selected.warData),
    content: `Rol eliminado: **${removed.name}**\nSelecciona un rol para continuar editando.`
  });
}

function buildRolePanelPayload(role) {
  const permissions = role.allowedRoleIds?.length
    ? role.allowedRoleIds.map(roleId => `<@&${roleId}>`).join(', ')
    : 'Sin restriccion';

  return {
    content: [
      `Panel de **${role.name}**`,
      `Slots: ${role.max}`,
      `Icono: ${role.emoji || 'Sin icono'}`,
      `Permisos: ${permissions}`
    ].join('\n'),
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_edit_name')
          .setLabel('Nombre')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_edit_slots')
          .setLabel('Slots')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_edit_icon')
          .setLabel('Icono')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_edit_permissions')
          .setLabel('Permisos')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_delete_role')
          .setLabel('Eliminar')
          .setStyle(ButtonStyle.Danger)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_roles')
          .setLabel('Volver a roles')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_back_to_editor')
          .setLabel('Volver al editor')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function buildRoleSelectionPayload(warData) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('panel_select_role')
    .setPlaceholder('Selecciona el rol del evento a editar')
    .addOptions(
      warData.roles.slice(0, 25).map((role, index) => {
        const permissionCount = Array.isArray(role.allowedRoleIds) ? role.allowedRoleIds.length : 0;
        const iconStatus = role.emoji ? 'con icono' : 'sin icono';
        return {
          label: `${role.name} (${role.max})`,
          value: String(index),
          description: `${iconStatus} | permisos: ${permissionCount}`
        };
      })
    );

  return {
    content: 'Selecciona un rol para abrir el panel de edicion',
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_back_to_editor')
          .setLabel('Volver al editor')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function getEditableWarForUser(interaction) {
  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) return null;
  if (warData.creatorId !== interaction.user.id) return null;
  return warData;
}

function getSelectedRoleContext(interaction) {
  const warData = getEditableWarForUser(interaction);
  if (!warData) {
    return { ok: false, message: 'Sesion expirada' };
  }

  const selectedIndex = global.warEditSelections?.[interaction.user.id];
  if (!Number.isInteger(selectedIndex)) {
    return { ok: false, message: 'Primero selecciona un rol en el panel de edicion' };
  }

  const role = warData.roles[selectedIndex];
  if (!role) {
    return { ok: false, message: 'El rol seleccionado ya no existe' };
  }

  return {
    ok: true,
    warData,
    role,
    roleIndex: selectedIndex
  };
}

function setSelectedRoleIndex(userId, index) {
  if (!global.warEditSelections) global.warEditSelections = {};
  global.warEditSelections[userId] = index;
}

function clearSelectedRoleIndex(userId) {
  if (!global.warEditSelections) return;
  delete global.warEditSelections[userId];
}

function getPendingState(userId) {
  if (!global.warPanelPending) global.warPanelPending = {};
  if (!global.warPanelPending[userId]) {
    global.warPanelPending[userId] = {
      permissionIds: null,
      icon: null
    };
  }
  return global.warPanelPending[userId];
}
