const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const warService = require('../services/warService');
const { buildWarMessagePayload } = require('../utils/warMessageBuilder');
const { normalizeWar } = require('../utils/warState');

module.exports = async interaction => {
  const { customId } = interaction;

  try {
    if (customId === 'add_roles_bulk') return await handleAddRolesBulkButton(interaction);
    if (customId === 'publish_war') return await handlePublishWar(interaction);
    if (customId === 'cancel_war') return await handleCancelWar(interaction);
    if (customId === 'skip_mentions_publish') return await handleSkipMentionsPublish(interaction);

    if (customId === 'open_role_panel') return await handleOpenRolePanel(interaction);
    if (customId === 'panel_select_role') return await handlePanelSelectRole(interaction);
    if (customId === 'panel_edit_name') return await handleShowEditRoleCommandHelp(interaction);
    if (customId === 'panel_edit_slots') return await handleShowEditRoleCommandHelp(interaction);
    if (customId === 'panel_edit_icon') return await handleShowEditRoleCommandHelp(interaction);
    if (customId === 'panel_edit_permissions') return await handleOpenEditPermissions(interaction);
    if (customId === 'panel_set_permissions') return await handlePanelSetPermissions(interaction);
    if (customId === 'panel_clear_permissions') return await handlePanelClearPermissions(interaction);
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

  const { showScheduleDaysSelector } = require('./modalHandler');
  await showScheduleDaysSelector(interaction, warData);
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
  const { confirmAndPublish } = require('./modalHandler');
  const warData = global.warEdits?.[interaction.user.id];
  const scheduleTemp = global.warScheduleTemp?.[interaction.user.id];

  if (!warData || !scheduleTemp) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  await interaction.deferUpdate();
  
  // Importar directamente la función de confirmación
  const warService = require('../services/warService');
  const { normalizeWar } = require('../utils/warState');
  const { buildWarMessagePayload } = require('../utils/warMessageBuilder');
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  if (warData.roles.length === 0) {
    return await interaction.editReply({ content: '❌ Agrega al menos 1 rol antes de publicar', components: [] });
  }

  const createdWars = [];
  for (const dayOfWeek of scheduleTemp.days) {
    const warToCreate = {
      ...warData,
      dayOfWeek,
      notifyRoles: [],
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

  const daysText = scheduleTemp.days.map(d => dayNames[d]).join(', ');

  await interaction.editReply({
    content: `✅ **${warData.name}** publicado\n📅 Días: ${daysText}\n⏰ Hora: ${warData.time}\n📢 Sin menciones`,
    components: []
  });
}

async function handleOpenRolePanel(interaction) {
  const warData = getEditableWarForUser(interaction);
  if (!warData) {
    return await interaction.reply({ content: 'Sesion expirada', flags: 64 });
  }

  if (!warData.roles.length) {
    return await interaction.reply({ content: 'Agrega roles primero', flags: 64 });
  }

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

  await interaction.reply({
    content: 'Selecciona un rol para abrir el panel de edicion',
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: 64
  });
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

async function handleShowEditRoleCommandHelp(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  await interaction.reply({
    content: [
      `Para editar **${selected.role.name}** usa el comando:`,
      '`/editrole rename rol:<rol> nombre:<nuevo>`',
      '`/editrole slots rol:<rol> cantidad:<n>`',
      '`/editrole icon rol:<rol> valor:<emoji o <:nombre:id>>`',
      '`/editrole clearicon rol:<rol>`'
    ].join('\n'),
    flags: 64
  });
}

async function handleOpenEditPermissions(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const currentText = selected.role.allowedRoleIds?.length
    ? selected.role.allowedRoleIds.map(roleId => `<@&${roleId}>`).join(', ')
    : 'Sin restriccion';

  await interaction.reply({
    content: `Permisos para **${selected.role.name}**\nActual: ${currentText}`,
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
      )
    ],
    flags: 64
  });
}

async function handlePanelSetPermissions(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.update({ content: selected.message, components: [] });
  }

  const selectedIds = interaction.values.map(String);
  selected.role.allowedRoleIds = selectedIds;
  selected.role.allowedRoles = selectedIds
    .map(roleId => interaction.guild?.roles.cache.get(roleId)?.name)
    .filter(Boolean);

  const linkedText = selectedIds.length
    ? selectedIds.map(roleId => `<@&${roleId}>`).join(', ')
    : 'Sin restriccion';

  await interaction.update({
    content: `Permisos guardados para **${selected.role.name}**\nPermitidos: ${linkedText}`,
    components: []
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
    components: []
  });
}

async function handlePanelDeleteRole(interaction) {
  const selected = getSelectedRoleContext(interaction);
  if (!selected.ok) {
    return await interaction.reply({ content: selected.message, flags: 64 });
  }

  const removed = selected.warData.roles.splice(selected.roleIndex, 1)[0];

  clearSelectedRoleIndex(interaction.user.id);
  await interaction.reply({
    content: `Rol eliminado: **${removed.name}**`,
    flags: 64
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
      `Permisos: ${permissions}`,
      '',
      'Edicion rapida:',
      '/editrole rename',
      '/editrole slots',
      '/editrole icon',
      '/editrole clearicon'
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_edit_name')
          .setLabel('Nombre (/editrole)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_edit_slots')
          .setLabel('Slots (/editrole)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_edit_icon')
          .setLabel('Icono (/editrole)')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_edit_permissions')
          .setLabel('Permisos')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_delete_role')
          .setLabel('Eliminar')
          .setStyle(ButtonStyle.Danger)
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
