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
const { getDraftWar } = require('../../utils/draftSessionStore');

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
  const { showRolesEditor } = require('../modalHandler');
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
  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferUpdate();
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;
      throw error;
    }
  }

  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.editReply({ content: selected.message, embeds: [], components: [] });
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

  await interaction.editReply({
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
    .setPlaceholder('Ej: <:caller:123456789012345678> o ðŸ›¡ï¸')
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
    const { showRolesEditor } = require('../modalHandler');
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
  const warData = getDraftWar(interaction.user.id);
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

const ROLE_PANEL_ACTIONS = {
  open_role_panel: handleOpenRolePanel,
  panel_back_to_roles: handleOpenRolePanel,
  panel_back_to_editor: handleBackToEditor,
  panel_select_role: handlePanelSelectRole,
  panel_back_to_role: handleBackToRole,
  panel_edit_name: handlePanelEditName,
  panel_edit_slots: handlePanelEditSlots,
  panel_edit_icon: handlePanelEditIcon,
  panel_edit_permissions: handleOpenEditPermissions,
  panel_set_permissions: handlePanelSetPermissions,
  panel_confirm_permissions: handlePanelConfirmPermissions,
  panel_clear_permissions: handlePanelClearPermissions,
  panel_set_icon: handlePanelSetIcon,
  panel_confirm_icon: handlePanelConfirmIcon,
  panel_open_icon_modal: handlePanelOpenIconModal,
  panel_clear_icon: handlePanelClearIcon,
  panel_delete_role: handlePanelDeleteRole
};

module.exports = {
  ROLE_PANEL_ACTIONS
};
