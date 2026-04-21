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
const { hasGuildServerEmojiConfig } = require('../../services/serverClassEmojiService');
const {
  normalizeClassIconSource,
  normalizeParticipantDisplayStyle
} = require('../../utils/participantDisplayFormatter');

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

async function handleOpenClassIconSourceConfig(interaction) {
  const warData = getEditableWarForUser(interaction);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', embeds: [], components: [] });
  }

  await interaction.update(buildVisualSettingsPayload(warData, interaction.guild));
}

async function handleSetClassIconSource(interaction) {
  const warData = getEditableWarForUser(interaction);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', embeds: [], components: [] });
  }

  const selected = normalizeClassIconSource(interaction.values?.[0]);
  warData.classIconSource = selected;

  await interaction.update({
    ...buildVisualSettingsPayload(warData, interaction.guild),
    content: `Fuente de iconos de clase actualizada: **${getClassIconSourceLabel(selected, interaction.guild)}**`
  });
}

async function handleSetParticipantDisplayStyle(interaction) {
  const warData = getEditableWarForUser(interaction);
  if (!warData) {
    return await interaction.update({ content: 'Sesion expirada', embeds: [], components: [] });
  }

  const selected = normalizeParticipantDisplayStyle(interaction.values?.[0]);
  warData.participantDisplayStyle = selected;

  await interaction.update({
    ...buildVisualSettingsPayload(warData, interaction.guild),
    content: `Estilo visual actualizado: **${getDisplayStyleLabel(selected)}**`
  });
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

  const source = normalizeClassIconSource(selected.warData.classIconSource);
  await ensureIconSourcesLoaded(interaction, source);
  await interaction.editReply(buildRoleIconSelectionPayload(interaction, selected.role.name, source));
}

async function handlePanelSelectIconSource(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, embeds: [], components: [] });
  }

  const source = normalizeClassIconSource(interaction.values?.[0]);
  selected.warData.classIconSource = source;
  await ensureIconSourcesLoaded(interaction, source);

  await interaction.update(buildRoleIconSelectionPayload(interaction, selected.role.name, source));
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

async function handlePanelSetBotIcon(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, components: [] });
  }

  const emojiId = String(interaction.values?.[0] || '').trim();
  if (!emojiId) {
    return await interaction.update({ content: 'Emoji invalido.', components: [] });
  }

  const appEmojis = await fetchApplicationEmojis(interaction);
  const picked = appEmojis.find(emoji => String(emoji.id) === emojiId);
  if (!picked) {
    return await interaction.update({
      content: 'Emoji de bot no disponible. Prueba de nuevo.',
      components: buildRoleIconSelectionPayload(interaction, selected.role.name, 'bot').components
    });
  }

  const inline = `<${picked.animated ? 'a' : ''}:${picked.name}:${picked.id}>`;
  const pending = getPendingState(interaction.user.id);
  pending.icon = {
    emoji: inline,
    emojiSource: 'application'
  };

  await interaction.update({
    content: `Icono de bot pendiente para **${selected.role.name}**: ${inline}`,
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

async function handleBotIconPageChange(interaction, delta) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, embeds: [], components: [] });
  }

  const pending = getPendingState(interaction.user.id);
  const appEmojis = getApplicationEmojiCache(interaction);
  const totalPages = Math.max(1, Math.ceil(appEmojis.length / 25));
  const current = Number.isInteger(pending.botIconPage) ? pending.botIconPage : 0;
  const next = Math.max(0, Math.min(totalPages - 1, current + delta));
  pending.botIconPage = next;

  await interaction.update(buildRoleIconSelectionPayload(interaction, selected.role.name, 'bot'));
}

async function handlePanelBotIconPagePrev(interaction) {
  return await handleBotIconPageChange(interaction, -1);
}

async function handlePanelBotIconPageNext(interaction) {
  return await handleBotIconPageChange(interaction, 1);
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
    .setPlaceholder('Ej: <:caller:123456789012345678> o \uD83D\uDEE1\uFE0F')
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

function buildRoleIconSelectionPayload(interaction, roleName, source) {
  const normalizedSource = normalizeClassIconSource(source);
  const components = [];
  const sourceMenu = new StringSelectMenuBuilder()
    .setCustomId('panel_pick_icon_source')
    .setPlaceholder('Paso 1: Fuente de icono')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      {
        label: 'Bot',
        value: 'bot',
        description: 'Usa emojis de aplicacion del bot',
        default: normalizedSource === 'bot'
      },
      {
        label: interaction.guild?.name?.slice(0, 100) || 'Servidor',
        value: 'guild',
        description: 'Usa emojis del servidor',
        default: normalizedSource === 'guild'
      }
    ]);
  components.push(new ActionRowBuilder().addComponents(sourceMenu));

  if (normalizedSource === 'bot') {
    const botOptions = getBotIconOptions(interaction, interaction.user?.id);
    if (botOptions.length > 0) {
      const botMenu = new StringSelectMenuBuilder()
        .setCustomId('panel_set_bot_icon')
        .setPlaceholder('Paso 2: Emoji de la aplicacion')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(botOptions);
      components.push(new ActionRowBuilder().addComponents(botMenu));

      const page = getBotEmojiPage(interaction.user?.id);
      const totalPages = Math.max(1, Math.ceil(getApplicationEmojiCache(interaction).length / 25));
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_bot_icon_prev')
            .setLabel('Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
          new ButtonBuilder()
            .setCustomId('panel_bot_icon_next')
            .setLabel(`Siguiente (${page + 1}/${totalPages})`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
        )
      );
    }
  } else {
    const guildOptions = getGuildIconOptions(interaction);
    if (guildOptions.length > 0) {
      const guildMenu = new StringSelectMenuBuilder()
        .setCustomId('panel_set_icon')
        .setPlaceholder('Paso 2: Emoji del servidor')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(guildOptions);
      components.push(new ActionRowBuilder().addComponents(guildMenu));
    }
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

  const guildReady = getGuildIconOptions(interaction).length > 0;
  const botReady = getBotIconOptions(interaction, interaction.user?.id).length > 0;
  const sourceLabel = normalizedSource === 'guild'
    ? (interaction.guild?.name || 'Servidor')
    : 'Bot';
  const sourceNote = normalizedSource === 'bot'
    ? 'Se muestran emojis de aplicacion del bot.'
    : 'Se muestran emojis del servidor.';

  return {
    content: [
      `Iconos para **${roleName}**`,
      `Fuente seleccionada: **${sourceLabel}**`,
      `Disponibles -> servidor: ${guildReady ? 'si' : 'no'} | bot: ${botReady ? 'si' : 'no'}`,
      sourceNote
    ].filter(Boolean).join('\n'),
    embeds: [],
    components
  };
}

function getGuildIconOptions(interaction) {
  const emojis = interaction.guild?.emojis?.cache;
  if (!emojis) return [];
  return Array.from(emojis.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
    .map(emoji => ({
      label: emoji.name.slice(0, 100),
      value: String(emoji.id),
      emoji: { id: emoji.id, name: emoji.name, animated: emoji.animated }
    }));
}

function getBotIconOptions(interaction, userId) {
  const appEmojis = getApplicationEmojiCache(interaction);
  const page = getBotEmojiPage(userId);
  const start = page * 25;
  return appEmojis
    .slice(start, start + 25)
    .map(emoji => ({
      label: String(emoji.name).slice(0, 100),
      value: String(emoji.id),
      emoji: { id: emoji.id, name: emoji.name, animated: emoji.animated }
    }));
}

async function fetchApplicationEmojis(interaction) {
  try {
    await interaction.client.application.fetch();
    const fetched = await interaction.client.application.emojis.fetch();
    const emojis = Array.from(fetched.values()).filter(emoji => emoji?.id && emoji?.name);
    cacheApplicationEmojis(interaction, emojis);
    return emojis;
  } catch (error) {
    return getApplicationEmojiCache(interaction);
  }
}

async function ensureIconSourcesLoaded(interaction, source) {
  const normalized = normalizeClassIconSource(source);
  if (normalized === 'guild') {
    await interaction.guild?.emojis?.fetch().catch(() => null);
  }
  if (normalized === 'bot') {
    await fetchApplicationEmojis(interaction);
  }
}

function cacheApplicationEmojis(interaction, emojis) {
  if (!global.appEmojiCacheByAppId) global.appEmojiCacheByAppId = {};
  const appId = String(interaction.client?.application?.id || interaction.client?.user?.id || '');
  if (!appId) return;
  global.appEmojiCacheByAppId[appId] = {
    at: Date.now(),
    emojis
  };
}

function getApplicationEmojiCache(interaction) {
  const appId = String(interaction.client?.application?.id || interaction.client?.user?.id || '');
  const cached = appId && global.appEmojiCacheByAppId ? global.appEmojiCacheByAppId[appId] : null;
  if (cached?.emojis?.length) return cached.emojis;

  const fromClient = interaction.client?.application?.emojis?.cache;
  if (fromClient && fromClient.size > 0) {
    return Array.from(fromClient.values()).filter(emoji => emoji?.id && emoji?.name);
  }

  return [];
}

function getBotEmojiPage(userId) {
  if (!userId) return 0;
  const pending = getPendingState(userId);
  return Number.isInteger(pending.botIconPage) && pending.botIconPage >= 0
    ? pending.botIconPage
    : 0;
}

function buildVisualSettingsPayload(warData, guild) {
  const current = normalizeClassIconSource(warData.classIconSource);
  const currentStyle = normalizeParticipantDisplayStyle(warData.participantDisplayStyle);
  const guildName = guild?.name || 'Servidor actual';
  const serverConfigReady = Boolean(guild?.id && hasGuildServerEmojiConfig(guild.id));

  const sourceMenu = new StringSelectMenuBuilder()
    .setCustomId('panel_set_class_icon_source')
    .setPlaceholder('Selecciona fuente de iconos de clase')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      {
        label: 'Bot',
        value: 'bot',
        description: 'Usa solo application emojis del bot',
        default: current === 'bot'
      },
      {
        label: guildName.slice(0, 100),
        value: 'guild',
        description: serverConfigReady
          ? 'Usa solo emojis del servidor configurados'
          : 'Sin mapping configurado, puede no mostrar iconos',
        default: current === 'guild'
      }
    ]);

  const styleMenu = new StringSelectMenuBuilder()
    .setCustomId('panel_set_display_style')
    .setPlaceholder('Selecciona estilo de inscritos')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      {
        label: 'Classic',
        value: 'classic',
        description: '| <:Maegu:...> Bazooka',
        default: currentStyle === 'classic'
      },
      {
        label: 'Modern',
        value: 'modern',
        description: '| <:Maegu:...> Bazooka · 856A',
        default: currentStyle === 'modern'
      },
      {
        label: 'Hybrid',
        value: 'hybrid',
        description: '| <:Maegu:...> Bazooka',
        default: currentStyle === 'hybrid'
      }
    ]);

  return {
    content: [
      `Fuente de iconos: **${getClassIconSourceLabel(current, guild)}**`,
      `Estilo de inscritos: **${getDisplayStyleLabel(currentStyle)}**`,
      serverConfigReady
        ? 'Mapping de iconos del servidor: configurado'
        : 'Mapping de iconos del servidor: no configurado (fallback limpio activo)'
    ].join('\n'),
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(sourceMenu),
      new ActionRowBuilder().addComponents(styleMenu),
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

function getClassIconSourceLabel(source, guild) {
  if (source === 'guild') return guild?.name || 'Servidor actual';
  return 'Bot';
}

function getDisplayStyleLabel(style) {
  if (style === 'classic') return 'Classic';
  if (style === 'hybrid') return 'Hybrid';
  return 'Modern';
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
      icon: null,
      botIconPage: 0
    };
  }
  return global.warPanelPending[userId];
}

const ROLE_PANEL_ACTIONS = {
  open_role_panel: handleOpenRolePanel,
  panel_back_to_roles: handleOpenRolePanel,
  panel_back_to_editor: handleBackToEditor,
  panel_visual_settings: handleOpenClassIconSourceConfig,
  panel_set_class_icon_source: handleSetClassIconSource,
  panel_set_display_style: handleSetParticipantDisplayStyle,
  panel_pick_icon_source: handlePanelSelectIconSource,
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
  panel_set_bot_icon: handlePanelSetBotIcon,
  panel_bot_icon_prev: handlePanelBotIconPagePrev,
  panel_bot_icon_next: handlePanelBotIconPageNext,
  panel_confirm_icon: handlePanelConfirmIcon,
  panel_open_icon_modal: handlePanelOpenIconModal,
  panel_clear_icon: handlePanelClearIcon,
  panel_delete_role: handlePanelDeleteRole
};

module.exports = {
  ROLE_PANEL_ACTIONS
};
