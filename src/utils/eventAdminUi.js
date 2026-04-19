const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function buildEventSelectorPayload(wars) {
  const sorted = [...wars].sort((a, b) => b.createdAt - a.createdAt);
  const visible = sorted.slice(0, 25);

  const embed = new EmbedBuilder()
    .setTitle('Seleccionar Evento')
    .setDescription(
      visible.length
        ? 'Elige un evento para abrir su panel administrativo.'
        : 'No hay eventos creados/publicados en este canal.'
    )
    .setColor(0x2b2d31);

  if (!visible.length) {
    return { embeds: [embed], components: [] };
  }

  const options = visible.map(war => ({
    label: truncate(`${war.name} - ${getModeLabel(war)}`, 100),
    description: truncate(`${getStatusLabel(war)} - ${getTimeReference(war)}`, 100),
    value: String(war.id)
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('panel_event_select')
    .setPlaceholder('Selecciona un evento')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_event_list_refresh')
      .setLabel('Actualizar lista')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_event_exit')
      .setLabel('Salir editor')
      .setStyle(ButtonStyle.Danger)
  );

  if (sorted.length > visible.length) {
    embed.addFields({
      name: 'Nota',
      value: `Mostrando ${visible.length} de ${sorted.length} eventos recientes.`,
      inline: false
    });
  }

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select), actions]
  };
}

function buildEventPanelPayload(war, options = {}) {
  const embed = new EmbedBuilder()
    .setTitle(war.name || 'Evento')
    .setDescription(buildPanelDescription(war, options.scope))
    .setColor(0x5865f2);

  if (options.details) {
    const rolesCount = Array.isArray(war.roles) ? war.roles.length : 0;
    const participants = Array.isArray(war.roles)
      ? war.roles.reduce((acc, role) => acc + (Array.isArray(role.users) ? role.users.length : 0), 0)
      : 0;
    embed.addFields(
      { name: 'Roles', value: String(rolesCount), inline: true },
      { name: 'Inscritos', value: String(participants), inline: true },
      { name: 'ID interno', value: `\`${war.id}\``, inline: true }
    );
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_event_view_details').setLabel('Ver detalles').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_event_edit_roles').setLabel('Editar roles').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_event_edit_data').setLabel('Editar datos').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_event_edit_schedule').setLabel('Editar horario').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_event_publish_update').setLabel('Publicar/actualizar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_event_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_event_back_to_list').setLabel('Volver a lista').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildEventRolesEditorPayload(war, selectedRoleIndex = null, notice = '') {
  const roles = Array.isArray(war.roles) ? war.roles : [];
  const selectedRole = Number.isInteger(selectedRoleIndex) ? roles[selectedRoleIndex] : null;

  const descriptionLines = roles.length
    ? roles.map((role, index) => {
      const usersCount = Array.isArray(role.users) ? role.users.length : 0;
      const marker = index === selectedRoleIndex ? '-> ' : '';
      return `${marker}${role.emoji || 'o'} ${role.name} (${usersCount}/${role.max})`;
    })
    : ['No hay roles creados para este evento.'];

  const embed = new EmbedBuilder()
    .setTitle(`Editar roles: ${war.name}`)
    .setDescription(descriptionLines.join('\n'))
    .setColor(0x5865f2);

  if (notice) {
    embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });
  }

  const components = [];
  if (roles.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('panel_event_role_select')
      .setPlaceholder('Selecciona un rol')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        roles.slice(0, 25).map((role, index) => ({
          label: truncate(`${role.name} (${role.max})`, 100),
          description: truncate(`Inscritos: ${Array.isArray(role.users) ? role.users.length : 0}`, 100),
          value: String(index),
          default: index === selectedRoleIndex
        }))
      );

    components.push(new ActionRowBuilder().addComponents(menu));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_event_role_add').setLabel('Agregar rol').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel_event_role_rename').setLabel('Renombrar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_role_slots').setLabel('Slots').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_role_icon').setLabel('Icono').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_role_permissions').setLabel('Permisos').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_event_role_delete').setLabel('Eliminar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel_event_back_to_panel').setLabel('Volver al panel').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_back_to_list').setLabel('Volver a lista').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
    )
  );

  if (selectedRole) {
    const perms = Array.isArray(selectedRole.allowedRoleIds) && selectedRole.allowedRoleIds.length
      ? selectedRole.allowedRoleIds.map(roleId => `<@&${roleId}>`).join(', ')
      : 'Sin restricciones';
    embed.addFields(
      { name: 'Rol seleccionado', value: `${selectedRole.emoji || 'o'} ${selectedRole.name}`, inline: true },
      { name: 'Slots', value: String(selectedRole.max), inline: true },
      { name: 'Permisos', value: truncate(perms, 1024), inline: false }
    );
  }

  return { embeds: [embed], components };
}

function buildRolePermissionsPickerPayload(war, role, notice = '') {
  const embed = new EmbedBuilder()
    .setTitle(`Permisos de rol: ${role.name}`)
    .setDescription('Selecciona roles de Discord permitidos para este rol del evento.')
    .setColor(0x5865f2)
    .addFields({
      name: 'Actual',
      value: Array.isArray(role.allowedRoleIds) && role.allowedRoleIds.length
        ? role.allowedRoleIds.map(roleId => `<@&${roleId}>`).join(', ')
        : 'Sin restricciones',
      inline: false
    });

  if (notice) {
    embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });
  }

  const picker = new RoleSelectMenuBuilder()
    .setCustomId('panel_event_role_permissions_select')
    .setPlaceholder('Selecciona roles permitidos')
    .setMinValues(0)
    .setMaxValues(25);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(picker),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_role_permissions_confirm').setLabel('Guardar permisos').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('panel_event_role_permissions_clear').setLabel('Limpiar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('panel_event_role_permissions_back').setLabel('Volver a roles').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

function buildRoleIconPickerPayload(war, role, emojiOptions, notice = '') {
  const embed = new EmbedBuilder()
    .setTitle(`Icono de rol: ${role.name}`)
    .setDescription(
      [
        'Puedes seleccionar un emoji del servidor o escribir uno manualmente.',
        'Formatos validos manuales:',
        '- Emoji unicode (ej: ✅)',
        '- Emoji custom (ej: <:maegu:123456789012345678> o <a:anim:123456789012345678>)'
      ].join('\n')
    )
    .setColor(0x5865f2)
    .addFields({ name: 'Icono actual', value: role.emoji || 'Sin icono', inline: false });

  if (notice) {
    embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });
  }

  const components = [];
  if (Array.isArray(emojiOptions) && emojiOptions.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('panel_event_role_icon_pick')
      .setPlaceholder('Elegir emoji del servidor')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(emojiOptions.slice(0, 25));
    components.push(new ActionRowBuilder().addComponents(menu));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_event_role_icon_modal_open').setLabel('Escribir icono').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_event_role_icon_clear').setLabel('Limpiar icono').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel_event_role_icon_back').setLabel('Volver a roles').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
    )
  );

  return {
    embeds: [embed],
    components
  };
}

function buildScopePromptPayload(war, action) {
  const actionLabel =
    action === 'roles'
      ? 'Editar roles'
      : action === 'schedule'
        ? 'Editar horario'
        : 'Editar datos del evento';

  const embed = new EmbedBuilder()
    .setTitle(`Alcance de edicion: ${war.name}`)
    .setDescription('Este evento es recurrente. ¿Qué alcance quieres editar?')
    .setColor(0xf1c40f)
    .addFields({ name: 'Accion', value: actionLabel, inline: false });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('panel_event_scope_select')
    .setPlaceholder('Selecciona alcance')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      { label: 'Solo esta ocurrencia', value: `${action}:single`, description: 'No afecta toda la serie' },
      { label: 'Toda la serie', value: `${action}:series`, description: 'Aplica al grupo recurrente' }
    ]);

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_event_back_to_panel').setLabel('Volver').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu), back]
  };
}

function buildInfoPayload(title, description) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x2b2d31)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_back_to_panel').setLabel('Volver al panel').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_back_to_list').setLabel('Volver a lista').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

function buildCancelConfirmPayload(war) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`Cancelar evento: ${war.name}`)
        .setDescription('Se cerrara y se desactivara su programacion. Esta accion no elimina datos historicos.')
        .setColor(0xe67e22)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_cancel_confirm').setLabel('Confirmar cancelar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('panel_event_back_to_panel').setLabel('Volver').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

function buildEventDataEditorPayload(war, scope, notice = '') {
  const closeBefore = Number.isInteger(war.closeBeforeMinutes) ? war.closeBeforeMinutes : 0;
  const recapMinutes = Number.isInteger(war.recap?.minutesBeforeExpire) ? war.recap.minutesBeforeExpire : 0;
  const recapMessage = String(war.recap?.messageText || '').trim() || 'Sin mensaje';

  const embed = new EmbedBuilder()
    .setTitle(`Editar datos: ${war.name || 'Evento'}`)
    .setDescription([
      `${getModeLabel(war)} • ${getStatusLabel(war)}`,
      getTimeReference(war),
      `Cierre de inscripciones: ${closeBefore} min antes`,
      `Borrado hilo final: ${recapMinutes} min`,
      `Mensaje hilo final: ${truncate(recapMessage, 120)}`
    ].join('\n'))
    .setColor(0x5865f2);

  if (scope === 'series') embed.addFields({ name: 'Alcance', value: 'Toda la serie', inline: true });
  if (scope === 'single') embed.addFields({ name: 'Alcance', value: 'Solo esta ocurrencia', inline: true });
  if (notice) embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_data_edit_basic').setLabel('Nombre y descripcion').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('panel_event_data_edit_close').setLabel('Cierre inscripciones').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_data_edit_recap').setLabel('Hilo final').setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_data_edit_schedule').setLabel('Editar horario').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_data_edit_mentions').setLabel('Menciones/publicacion').setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_back_to_panel').setLabel('Volver al panel').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_back_to_list').setLabel('Volver a lista').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

function getModeLabel(war) {
  return war.schedule?.mode === 'once' ? 'Unico' : 'Recurrente';
}

function getStatusLabel(war) {
  if (war.isClosed) return 'Cerrado';
  if (war.messageId) return 'Publicado';
  return 'Creado';
}

function getTimeReference(war) {
  if (Number.isInteger(war.dayOfWeek) && war.time) {
    return `Prox: ${DAY_NAMES_SHORT[war.dayOfWeek] || '?'} ${war.time}`;
  }
  if (war.time) {
    return `Hora: ${war.time}`;
  }
  return 'Sin horario';
}

function buildPanelDescription(war, scope) {
  const lines = [
    `${getModeLabel(war)} • ${getStatusLabel(war)}`,
    getTimeReference(war)
  ];
  if (scope === 'series') lines.push('Alcance activo: Toda la serie');
  if (scope === 'single') lines.push('Alcance activo: Solo esta ocurrencia');
  return lines.join('\n');
}

function truncate(text, max) {
  const value = String(text || '');
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

module.exports = {
  buildEventSelectorPayload,
  buildEventPanelPayload,
  buildEventRolesEditorPayload,
  buildRolePermissionsPickerPayload,
  buildRoleIconPickerPayload,
  buildEventDataEditorPayload,
  buildScopePromptPayload,
  buildInfoPayload,
  buildCancelConfirmPayload,
  getModeLabel,
  getStatusLabel,
  getTimeReference
};
