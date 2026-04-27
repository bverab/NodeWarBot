const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder
} = require('discord.js');
const { normalizeEventType } = require('../constants/eventTypes');
const { neutralizeMassMentions } = require('./textSafety');

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
  if (normalizeEventType(war.eventType) === 'pve') {
    return buildPveEventPanelPayload(war, options);
  }

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
    new ButtonBuilder().setCustomId('panel_event_finish_keep').setLabel('Guardar sin publicar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_event_finish_publish').setLabel('Guardar y publicar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_event_cancel').setLabel('Cancelar evento').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_event_back_to_list').setLabel('Volver a lista').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildPveEventPanelPayload(war, options = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`${war.name || 'Evento PvE'} (PvE)`)
    .setDescription(buildPanelDescription(war, options.scope))
    .setColor(0x2ecc71);

  if (options.details) {
    embed.addFields(
      { name: 'Horarios', value: String(Array.isArray(war.timeSlots) ? war.timeSlots.length : 0), inline: true },
      { name: 'Acceso', value: String(war.accessMode || 'OPEN'), inline: true },
      { name: 'ID interno', value: `\`${war.id}\``, inline: true }
    );
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_event_view_details').setLabel('Ver detalles').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_pve_edit_slots').setLabel('Editar horarios').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_pve_edit_access').setLabel('Editar acceso').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_pve_manage_enrollments').setLabel('Gestionar inscritos').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_event_edit_data').setLabel('Editar datos').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_event_finish_keep').setLabel('Guardar sin publicar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_event_finish_publish').setLabel('Guardar y publicar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_event_cancel').setLabel('Cancelar evento').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_event_back_to_list').setLabel('Volver a lista').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildPveAccessEditorPayload(war, options = {}) {
  const notice = String(options.notice || '');
  const accessMode = String(war.accessMode || 'OPEN').toUpperCase() === 'RESTRICTED' ? 'RESTRICTED' : 'OPEN';
  const allowedUserIds = Array.isArray(war.allowedUserIds) ? war.allowedUserIds : [];
  const allowedText = allowedUserIds.length > 0 ? allowedUserIds.map(id => `<@${id}>`).join(', ') : 'Sin usuarios permitidos';

  const embed = new EmbedBuilder()
    .setTitle(`Acceso PvE: ${war.name}`)
    .setDescription(`Modo actual: **${accessMode}**`)
    .setColor(0x2ecc71)
    .addFields({ name: 'Usuarios permitidos', value: truncate(allowedText, 1024), inline: false });

  if (notice) embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });

  const modeMenu = new StringSelectMenuBuilder()
    .setCustomId('panel_pve_access_mode_select')
    .setPlaceholder('Selecciona modo de acceso')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      { label: 'Open', value: 'OPEN', default: accessMode === 'OPEN' },
      { label: 'Restricted', value: 'RESTRICTED', default: accessMode === 'RESTRICTED' }
    ]);

  const usersPicker = new UserSelectMenuBuilder()
    .setCustomId('panel_pve_access_users_select')
    .setPlaceholder('Selecciona usuarios permitidos')
    .setMinValues(0)
    .setMaxValues(25);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(modeMenu),
      new ActionRowBuilder().addComponents(usersPicker),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_pve_access_back').setLabel('Volver').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

function buildPveSlotsEditorPayload(war, view = {}, options = {}) {
  const notice = String(options.notice || '');
  const selectedOptionId = options.selectedOptionId ? String(options.selectedOptionId) : null;
  const slotOptions = Array.isArray(view.options) ? view.options : [];
  const selected = slotOptions.find(slot => String(slot.id) === selectedOptionId) || slotOptions[0] || null;
  const selectedText = selected
    ? `⏰ ${selected.time} (${selected.enrollments.length}/${selected.capacity})`
    : 'Sin horario seleccionado';

  const lines = slotOptions.length > 0
    ? slotOptions.map((slot, index) => {
      const marker = selected && selected.id === slot.id ? '-> ' : '';
      return `${marker}${index + 1}. ⏰ ${slot.time} (${slot.enrollments.length}/${slot.capacity})`;
    })
    : ['Sin horarios configurados.'];

  const embed = new EmbedBuilder()
    .setTitle(`Horarios PvE: ${war.name}`)
    .setDescription(lines.join('\n'))
    .setColor(0x2ecc71)
    .addFields({ name: 'Seleccion actual', value: selectedText, inline: false });

  if (notice) embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });

  const components = [];
  if (slotOptions.length > 0) {
    const slotMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_pve_slots_select')
      .setPlaceholder('Selecciona horario')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(slotOptions.slice(0, 25).map(slot => ({
        label: truncate(`${slot.time} (${slot.enrollments.length}/${slot.capacity})`, 100),
        description: truncate(`ID ${slot.id}`, 100),
        value: String(slot.id),
        default: selected ? selected.id === slot.id : false
      })));
    components.push(new ActionRowBuilder().addComponents(slotMenu));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_pve_slot_add').setLabel('Agregar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel_pve_slot_edit').setLabel('Editar').setStyle(ButtonStyle.Secondary).setDisabled(!selected),
      new ButtonBuilder().setCustomId('panel_pve_slot_delete').setLabel('Eliminar').setStyle(ButtonStyle.Danger).setDisabled(!selected),
      new ButtonBuilder().setCustomId('panel_pve_slot_up').setLabel('Subir').setStyle(ButtonStyle.Primary).setDisabled(!selected),
      new ButtonBuilder().setCustomId('panel_pve_slot_down').setLabel('Bajar').setStyle(ButtonStyle.Primary).setDisabled(!selected)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_pve_slots_back').setLabel('Volver').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
    )
  );

  return {
    embeds: [embed],
    components
  };
}

function buildPveEnrollmentsEditorPayload(war, view = {}, options = {}) {
  const notice = String(options.notice || '');
  const selectedOptionId = options.selectedOptionId ? String(options.selectedOptionId) : null;
  const selectedEnrollmentKey = options.selectedEnrollmentKey ? String(options.selectedEnrollmentKey) : null;
  const slotOptions = Array.isArray(view.options) ? view.options : [];
  const selectedSlot = slotOptions.find(slot => String(slot.id) === selectedOptionId) || slotOptions[0] || null;

  const entries = selectedSlot
    ? [
      ...(Array.isArray(selectedSlot.enrollments) ? selectedSlot.enrollments.map(entry => ({ ...entry, enrollmentType: 'PRIMARY' })) : []),
      ...(Array.isArray(selectedSlot.fillers) ? selectedSlot.fillers.map(entry => ({ ...entry, enrollmentType: 'FILLER' })) : [])
    ]
    : [];

  const selectedEntry = entries.find(entry => `${entry.enrollmentType}:${entry.userId}` === selectedEnrollmentKey) || null;
  const selectedEntryText = selectedEntry
    ? `${selectedEntry.enrollmentType === 'FILLER' ? 'Filler' : 'Inscrito'}: ${selectedEntry.displayName} (${selectedEntry.userId})`
    : 'Sin participante seleccionado';

  const embed = new EmbedBuilder()
    .setTitle(`Inscripciones PvE: ${war.name}`)
    .setDescription(
      selectedSlot
        ? `Horario: ⏰ ${selectedSlot.time}\nInscritos: ${selectedSlot.enrollments.length}/${selectedSlot.capacity}\nFillers: ${selectedSlot.fillers.length}`
        : 'Sin horarios disponibles.'
    )
    .setColor(0x2ecc71)
    .addFields({ name: 'Participante seleccionado', value: truncate(selectedEntryText, 1024), inline: false });

  if (notice) embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });

  const components = [];
  if (slotOptions.length > 0) {
    const slotMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_pve_enroll_slot_select')
      .setPlaceholder('Selecciona horario')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(slotOptions.slice(0, 25).map(slot => ({
        label: truncate(`${slot.time} (${slot.enrollments.length}/${slot.capacity})`, 100),
        value: String(slot.id),
        default: selectedSlot ? slot.id === selectedSlot.id : false
      })));
    components.push(new ActionRowBuilder().addComponents(slotMenu));
  }

  if (entries.length > 0) {
    const enrollmentMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_pve_enroll_user_select')
      .setPlaceholder('Selecciona inscrito/filler')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(entries.slice(0, 25).map(entry => ({
        label: truncate(`${entry.enrollmentType === 'FILLER' ? '[F]' : '[I]'} ${entry.displayName}`, 100),
        description: truncate(entry.userId, 100),
        value: `${entry.enrollmentType}:${entry.userId}`,
        default: selectedEntry ? `${entry.enrollmentType}:${entry.userId}` === selectedEnrollmentKey : false
      })));
    components.push(new ActionRowBuilder().addComponents(enrollmentMenu));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_pve_enroll_add').setLabel('Agregar manual').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel_pve_enroll_remove').setLabel('Quitar').setStyle(ButtonStyle.Danger).setDisabled(!selectedEntry),
      new ButtonBuilder().setCustomId('panel_pve_enroll_move').setLabel('Mover').setStyle(ButtonStyle.Primary).setDisabled(!selectedEntry),
      new ButtonBuilder().setCustomId('panel_pve_enroll_promote').setLabel('Promover filler').setStyle(ButtonStyle.Secondary)
        .setDisabled(!selectedEntry || selectedEntry.enrollmentType !== 'FILLER')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_pve_enrollments_back').setLabel('Volver').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
    )
  );

  return {
    embeds: [embed],
    components
  };
}

function buildEventRolesEditorPayload(war, selectedRoleIndex = null, notice = '') {
  const roles = Array.isArray(war.roles) ? war.roles : [];
  const selectedRole = Number.isInteger(selectedRoleIndex) ? roles[selectedRoleIndex] : null;
  const canMoveUp = Number.isInteger(selectedRoleIndex) && selectedRoleIndex > 0;
  const canMoveDown = Number.isInteger(selectedRoleIndex) && selectedRoleIndex < roles.length - 1;

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
      new ButtonBuilder()
        .setCustomId('panel_event_role_move_up')
        .setLabel('Subir')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canMoveUp),
      new ButtonBuilder()
        .setCustomId('panel_event_role_move_down')
        .setLabel('Bajar')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canMoveDown)
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

function buildRoleIconPickerPayload(war, role, options = {}) {
  const source = String(options.source || 'bot');
  const guildEmojiOptions = Array.isArray(options.guildEmojiOptions) ? options.guildEmojiOptions : [];
  const botEmojiOptions = Array.isArray(options.botEmojiOptions) ? options.botEmojiOptions : [];
  const notice = String(options.notice || '');
  const botPage = Number.isInteger(options.botPage) && options.botPage >= 0 ? options.botPage : 0;
  const botTotalPages = Number.isInteger(options.botTotalPages) && options.botTotalPages > 0 ? options.botTotalPages : 1;
  const sourceLabel = source === 'guild' ? (String(options.guildLabel || 'Servidor')) : 'Bot';

  const embed = new EmbedBuilder()
    .setTitle(`Icono de rol: ${role.name}`)
    .setDescription(
      [
        `Fuente actual: **${sourceLabel}**`,
        'Paso 1: Elige la fuente del icono.',
        'Paso 2: Selecciona el icono segun esa fuente.',
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
  const sourceMenu = new StringSelectMenuBuilder()
    .setCustomId('panel_event_role_icon_source')
    .setPlaceholder('Paso 1: Fuente de icono')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      {
        label: 'Bot',
        value: 'bot',
        description: 'Usa application emojis del bot',
        default: source === 'bot'
      },
      {
        label: 'Servidor',
        value: 'guild',
        description: 'Usa emojis del servidor actual',
        default: source === 'guild'
      }
    ]);
  components.push(new ActionRowBuilder().addComponents(sourceMenu));

  if (source === 'guild' && guildEmojiOptions.length > 0) {
    const guildMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_event_role_icon_pick')
      .setPlaceholder('Paso 2: Selecciona un emoji del servidor')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(guildEmojiOptions.slice(0, 25));
    components.push(new ActionRowBuilder().addComponents(guildMenu));
  }

  if (source === 'bot' && botEmojiOptions.length > 0) {
    const botMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_event_role_icon_bot_pick')
      .setPlaceholder('Paso 2: Selecciona un icono del bot')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(botEmojiOptions.slice(0, 25));
    components.push(new ActionRowBuilder().addComponents(botMenu));

    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_event_role_icon_bot_prev')
          .setLabel('Anterior')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(botPage <= 0),
        new ButtonBuilder()
          .setCustomId('panel_event_role_icon_bot_next')
          .setLabel(`Siguiente (${botPage + 1}/${botTotalPages})`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(botPage >= botTotalPages - 1)
      )
    );
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_event_role_icon_modal_open').setLabel('Escribir icono').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_event_role_icon_clear').setLabel('Limpiar icono').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel_event_role_icon_back').setLabel('Volver a roles').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
    )
  );

  if (source === 'bot' && botEmojiOptions.length === 0) {
    embed.addFields({
      name: 'Info',
      value: 'No hay application emojis disponibles en este momento para el bot.',
      inline: false
    });
  }
  if (source === 'guild' && guildEmojiOptions.length === 0) {
    embed.addFields({
      name: 'Info',
      value: 'No hay emojis del servidor disponibles en este momento.',
      inline: false
    });
  }

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

function buildEventMentionsEditorPayload(war, scope, notice = '') {
  const mentionIds = Array.isArray(war.notifyRoles) ? war.notifyRoles : [];
  const mentionsText = mentionIds.length ? mentionIds.map(id => `<@&${id}>`).join(', ') : 'Sin menciones configuradas';
  const threadEnabled = Boolean(war.recap?.enabled);
  const threadMinutes = Number.isInteger(war.recap?.minutesBeforeExpire) ? war.recap.minutesBeforeExpire : 0;
  const publishState = war.messageId ? 'Publicado (puede actualizarse)' : 'No publicado aun';

  const embed = new EmbedBuilder()
    .setTitle(`Menciones/publicacion: ${war.name || 'Evento'}`)
    .setDescription([
      `${getModeLabel(war)} • ${getStatusLabel(war)}`,
      `Publicacion: ${publishState}`
    ].join('\n'))
    .setColor(0x5865f2)
    .addFields(
      { name: 'Menciones actuales', value: truncate(mentionsText, 1024), inline: false },
      { name: 'Hilo final', value: threadEnabled ? `Activado (${threadMinutes} min)` : 'Desactivado', inline: false }
    );

  if (scope === 'series') embed.addFields({ name: 'Alcance', value: 'Toda la serie', inline: true });
  if (scope === 'single') embed.addFields({ name: 'Alcance', value: 'Solo esta ocurrencia', inline: true });
  if (notice) embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_mentions_edit').setLabel('Editar menciones').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('panel_event_mentions_recap').setLabel('Configurar hilo final').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_mentions_to_data').setLabel('Volver a datos').setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_back_to_panel').setLabel('Volver al panel').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

function buildEventMentionsPickerPayload(war, selectedMentionRoleIds = [], notice = '') {
  const selectedText = Array.isArray(selectedMentionRoleIds) && selectedMentionRoleIds.length
    ? selectedMentionRoleIds.map(id => `<@&${id}>`).join(', ')
    : 'Sin menciones seleccionadas';

  const embed = new EmbedBuilder()
    .setTitle(`Editar menciones: ${war.name || 'Evento'}`)
    .setDescription('Selecciona uno o varios roles para mencionar al publicar/actualizar el evento.')
    .setColor(0x5865f2)
    .addFields({ name: 'Seleccion actual', value: truncate(selectedText, 1024), inline: false });

  if (notice) embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });

  const picker = new RoleSelectMenuBuilder()
    .setCustomId('panel_event_mentions_select')
    .setPlaceholder('Selecciona roles a mencionar')
    .setMinValues(0)
    .setMaxValues(25);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(picker),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_mentions_save').setLabel('Guardar menciones').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('panel_event_mentions_back').setLabel('Volver').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

function buildSeriesScheduleManagerPayload(baseWar, seriesWars = [], options = {}) {
  const selectedEventId = options.selectedEventId ? String(options.selectedEventId) : null;
  const notice = String(options.notice || '');
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

  const ordered = [...seriesWars].sort((a, b) => (a.dayOfWeek - b.dayOfWeek) || String(a.time).localeCompare(String(b.time)));
  const selected = ordered.find(war => String(war.id) === selectedEventId) || ordered[0] || null;

  const lines = ordered.length
    ? ordered.map(war => {
      const marker = selected && selected.id === war.id ? '-> ' : '';
      const dayLabel = Number.isInteger(war.dayOfWeek) ? dayNames[war.dayOfWeek] : 'Sin dia';
      const published = war.messageId ? 'publicado' : 'sin publicar';
      return `${marker}${dayLabel} ${war.time || '--:--'} (${published})`;
    })
    : ['Sin ocurrencias en la serie.'];

  const embed = new EmbedBuilder()
    .setTitle(`Gestionar recurrencia: ${baseWar.name || 'Evento'}`)
    .setDescription(lines.join('\n'))
    .setColor(0x5865f2)
    .addFields(
      { name: 'Serie', value: `\`${String(baseWar.groupId || 'sin-group')}\``, inline: false },
      { name: 'Total de dias', value: String(ordered.length), inline: true },
      {
        name: 'Seleccion actual',
        value: selected
          ? `${dayNames[selected.dayOfWeek] || '?'} ${selected.time || '--:--'}`
          : '(ninguna)',
        inline: true
      },
      {
        name: 'Agregar multiples',
        value: 'Usa `Hora` + `Dias` en formato `0;2;4` (0=Dom ... 6=Sab).',
        inline: false
      }
    );

  if (notice) {
    embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });
  }

  const components = [];
  if (ordered.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('panel_event_schedule_series_select')
      .setPlaceholder('Selecciona una ocurrencia de la serie')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        ordered.slice(0, 25).map(war => ({
          label: truncate(`${dayNames[war.dayOfWeek] || '?'} ${war.time || '--:--'}`, 100),
          description: truncate(`${war.messageId ? 'Publicado' : 'Sin publicar'} | ${war.id}`, 100),
          value: String(war.id),
          default: selected ? selected.id === war.id : false
        }))
      );
    components.push(new ActionRowBuilder().addComponents(menu));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_event_schedule_series_add').setLabel('Agregar dia').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel_event_schedule_series_edit').setLabel('Editar dia').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_event_schedule_series_delete').setLabel('Eliminar dia').setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_event_schedule_series_back').setLabel('Volver').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_event_exit').setLabel('Salir').setStyle(ButtonStyle.Danger)
    )
  );

  return {
    embeds: [embed],
    components
  };
}

function buildPostEditActivationPayload(war, options = {}) {
  const scope = options.scope === 'series' ? 'series' : 'single';
  const notice = String(options.notice || '');
  const inactiveReasons = [];
  const nowMs = Date.now();
  const isExpired = Number.isFinite(war.expiresAt) && war.expiresAt > 0 && nowMs >= war.expiresAt;

  if (war.isClosed) inactiveReasons.push('inscripciones cerradas');
  if (!war.messageId) inactiveReasons.push('sin mensaje publicado');
  if (isExpired) inactiveReasons.push('evento expirado');

  const reasonText = inactiveReasons.length > 0 ? inactiveReasons.join(', ') : 'estado no activo';
  const scopeLabel = scope === 'series' ? 'toda la serie' : 'esta ocurrencia';

  const embed = new EmbedBuilder()
    .setTitle(`Cambios guardados: ${war.name || 'Evento'}`)
    .setDescription(
      [
        `El evento quedo en estado no activo (${reasonText}).`,
        `Alcance editado: **${scopeLabel}**.`,
        '',
        'Elige como continuar:'
      ].join('\n')
    )
    .setColor(0xf1c40f);

  if (notice) {
    embed.addFields({ name: 'Info', value: truncate(notice, 1024), inline: false });
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_event_post_edit_activate')
          .setLabel('Guardar cambios y activar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('panel_event_post_edit_keep')
          .setLabel('Guardar cambios sin activar')
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_event_back_to_panel').setLabel('Volver al panel').setStyle(ButtonStyle.Secondary),
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
  const value = neutralizeMassMentions(String(text || ''));
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

module.exports = {
  buildEventSelectorPayload,
  buildEventPanelPayload,
  buildPveEventPanelPayload,
  buildPveAccessEditorPayload,
  buildPveSlotsEditorPayload,
  buildPveEnrollmentsEditorPayload,
  buildEventRolesEditorPayload,
  buildRolePermissionsPickerPayload,
  buildRoleIconPickerPayload,
  buildEventDataEditorPayload,
  buildEventMentionsEditorPayload,
  buildEventMentionsPickerPayload,
  buildSeriesScheduleManagerPayload,
  buildPostEditActivationPayload,
  buildScopePromptPayload,
  buildInfoPayload,
  buildCancelConfirmPayload,
  getModeLabel,
  getStatusLabel,
  getTimeReference
};
