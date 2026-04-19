const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { parseEmojiInput } = require('../../utils/emojiHelper');
const { loadWars, updateWar } = require('../../services/warService');
const {
  buildCancelConfirmPayload,
  buildEventDataEditorPayload,
  buildEventPanelPayload,
  buildEventRolesEditorPayload,
  buildEventSelectorPayload,
  buildRoleIconPickerPayload,
  buildRolePermissionsPickerPayload,
  buildScopePromptPayload
} = require('../../utils/eventAdminUi');
const {
  clearSelectedEventContext,
  getSelectedEventContext,
  setSelectedEventContext
} = require('../../utils/eventAdminContextStore');
const { refreshWarMessage, isAdminExecutor } = require('../../commands/eventadminShared');

async function handleEventSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  if (!isAdminExecutor(interaction)) {
    return await interaction.update({ content: 'Solo Admin puede gestionar eventos.', embeds: [], components: [] });
  }

  const eventId = interaction.values?.[0];
  const war = findWarByIdAndChannel(eventId, interaction.channelId);
  if (!war) {
    return await interaction.update({ content: 'No se encontro el evento seleccionado.', embeds: [], components: [] });
  }

  const defaultScope = war.schedule?.mode === 'once' ? 'single' : 'series';
  await updateWithContext(interaction, buildEventPanelPayload(war, { scope: defaultScope }), war.id, {
    scope: defaultScope,
    selectedRoleIndex: null,
    pendingAction: null,
    pendingPermissionIds: null,
    currentView: 'panel'
  });
}

async function handleEventListRefresh(interaction) {
  if (!isAdminExecutor(interaction)) {
    return await interaction.update({ content: 'Solo Admin puede gestionar eventos.', embeds: [], components: [] });
  }
  const wars = listChannelWars(interaction.channelId);
  await interaction.update(buildEventSelectorPayload(wars));
}

async function handleEventBackToList(interaction) {
  const wars = listChannelWars(interaction.channelId);
  await interaction.update(buildEventSelectorPayload(wars));
}

async function handleEventExit(interaction) {
  clearSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await interaction.update({
    content: 'Editor cerrado.',
    embeds: [],
    components: []
  });
}

async function handleEventBackToPanel(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(interaction, buildEventPanelPayload(war, { scope: context?.scope || null }), war.id, {
    currentView: 'panel',
    pendingAction: null
  });
}

async function handleEventViewDetails(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(interaction, buildEventPanelPayload(war, { scope: context?.scope || null, details: true }), war.id, {
    currentView: 'panel'
  });
}

async function handleEventEditRoles(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  if (war.schedule?.mode !== 'once') {
    setPendingAction(interaction, war.id, 'roles');
    await updateWithContext(interaction, buildScopePromptPayload(war, 'roles'), war.id, { currentView: 'scope' });
    return;
  }

  await updateWithContext(interaction, buildEventRolesEditorPayload(war), war.id, {
    scope: 'single',
    currentView: 'roles'
  });
}

async function handleEventEditData(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  if (war.schedule?.mode !== 'once') {
    setPendingAction(interaction, war.id, 'data');
    await updateWithContext(interaction, buildScopePromptPayload(war, 'data'), war.id, { currentView: 'scope' });
    return;
  }

  await updateWithContext(interaction, buildEventDataEditorPayload(war, 'single'), war.id, {
    scope: 'single',
    currentView: 'data'
  });
}

async function handleEventEditSchedule(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  if (war.schedule?.mode !== 'once') {
    setPendingAction(interaction, war.id, 'schedule');
    await updateWithContext(interaction, buildScopePromptPayload(war, 'schedule'), war.id, { currentView: 'scope' });
    return;
  }

  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, { scope: 'single' });
  await showEditScheduleModal(interaction, war);
}

async function handleEventScopeSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const value = String(interaction.values?.[0] || '');
  const [actionRaw, scopeRaw] = value.split(':');
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const action = actionRaw || context?.pendingAction;
  const scope = scopeRaw === 'series' ? 'series' : 'single';

  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, {
    scope,
    pendingAction: null
  });

  if (action === 'roles') {
    const notice = scope === 'series' && war.schedule?.mode !== 'once'
      ? 'La edicion de roles para serie completa aun no esta disponible. Se abrio el editor de esta ocurrencia para mantener el flujo.'
      : '';
    await updateWithContext(interaction, buildEventRolesEditorPayload(war, null, notice), war.id, { currentView: 'roles' });
    return;
  }

  if (action === 'data') {
    await updateWithContext(interaction, buildEventDataEditorPayload(war, scope), war.id, { currentView: 'data' });
    return;
  }

  if (action === 'schedule') {
    await showEditScheduleModal(interaction, war);
    return;
  }

  await updateWithContext(interaction, buildEventPanelPayload(war, { scope }), war.id, { currentView: 'panel' });
}

async function handleEventPublishUpdate(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  let notice = '';
  if (!war.messageId) {
    notice = 'El evento no tiene mensaje publicado aun.';
  } else {
    const refreshed = await refreshWarMessage(interaction, war);
    notice = refreshed
      ? 'Mensaje del evento actualizado correctamente.'
      : 'No se pudo actualizar el mensaje publicado, pero el evento sigue intacto.';
  }

  const ctx = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(
    interaction,
    { ...buildEventPanelPayload(war, { scope: ctx?.scope || null }), content: notice },
    war.id,
    { currentView: 'panel' }
  );
}

async function handleEventCancel(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  await updateWithContext(interaction, buildCancelConfirmPayload(war), war.id, { currentView: 'cancel_confirm' });
}

async function handleEventCancelConfirm(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  war.isClosed = true;
  if (war.schedule) {
    war.schedule.enabled = false;
  }
  const updated = updateWar(war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  const ctx = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(
    interaction,
    { ...buildEventPanelPayload(updated, { scope: ctx?.scope || null }), content: `Evento cancelado: **${updated.name}**` },
    updated.id,
    { currentView: 'panel' }
  );
}

async function handleEventRoleSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const index = Number.parseInt(interaction.values?.[0], 10);
  if (!Number.isInteger(index) || !war.roles?.[index]) {
    await updateWithContext(interaction, buildEventRolesEditorPayload(war), war.id, { currentView: 'roles' });
    return;
  }

  await updateWithContext(interaction, buildEventRolesEditorPayload(war, index), war.id, {
    selectedRoleIndex: index,
    currentView: 'roles'
  });
}

async function handleEventRoleAdd(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.reply({ content: 'No hay evento seleccionado. Usa `/event edit`.', flags: 64 });
  }

  const modal = new ModalBuilder().setCustomId('panel_event_role_add_modal').setTitle(`Agregar rol: ${trimTitle(war.name)}`);
  const nameInput = new TextInputBuilder()
    .setCustomId('panel_event_role_add_name')
    .setLabel('Nombre del rol')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(60);
  const slotsInput = new TextInputBuilder()
    .setCustomId('panel_event_role_add_slots')
    .setLabel('Slots (1-999)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue('1')
    .setMaxLength(3);
  const iconInput = new TextInputBuilder()
    .setCustomId('panel_event_role_add_icon')
    .setLabel('Icono (unicode o <:nombre:id>)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(slotsInput),
    new ActionRowBuilder().addComponents(iconInput)
  );
  await interaction.showModal(modal);
}

async function handleEventRoleRename(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.reply({ content: context.message, flags: 64 });
  }

  const modal = new ModalBuilder().setCustomId('panel_event_role_rename_modal').setTitle(`Renombrar: ${trimTitle(context.role.name)}`);
  const nameInput = new TextInputBuilder()
    .setCustomId('panel_event_role_rename_name')
    .setLabel('Nuevo nombre')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(60)
    .setValue(String(context.role.name).slice(0, 60));

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
  await interaction.showModal(modal);
}

async function handleEventRoleSlots(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.reply({ content: context.message, flags: 64 });
  }

  const modal = new ModalBuilder().setCustomId('panel_event_role_slots_modal').setTitle(`Slots: ${trimTitle(context.role.name)}`);
  const slotsInput = new TextInputBuilder()
    .setCustomId('panel_event_role_slots_value')
    .setLabel('Nueva cantidad de slots')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue(String(context.role.max));

  modal.addComponents(new ActionRowBuilder().addComponents(slotsInput));
  await interaction.showModal(modal);
}

async function handleEventRoleIcon(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.reply({ content: context.message, flags: 64 });
  }

  const emojiOptions = await fetchGuildEmojiOptions(interaction);
  await updateWithContext(
    interaction,
    buildRoleIconPickerPayload(context.war, context.role, emojiOptions),
    context.war.id,
    { currentView: 'role_icon' }
  );
}

async function handleEventRoleIconPick(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  const emojiRaw = String(interaction.values?.[0] || '').trim();
  const parsed = parseRoleIconInput(emojiRaw, interaction.guild);
  if (!parsed) {
    const options = await fetchGuildEmojiOptions(interaction);
    await updateWithContext(
      interaction,
      buildRoleIconPickerPayload(context.war, context.role, options, 'Emoji invalido. Selecciona uno del listado o escribe uno valido.'),
      context.war.id,
      { currentView: 'role_icon' }
    );
    return;
  }

  context.role.emoji = parsed.emoji;
  context.role.emojiSource = parsed.emojiSource;
  const updated = updateWar(context.war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  await updateWithContext(
    interaction,
    {
      ...buildEventRolesEditorPayload(updated, context.roleIndex),
      content: `Icono guardado para **${updated.roles[context.roleIndex].name}**: ${parsed.emoji}`
    },
    updated.id,
    { currentView: 'roles' }
  );
}

async function handleEventRoleIconModalOpen(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.reply({ content: context.message, flags: 64 });
  }

  const modal = new ModalBuilder().setCustomId('panel_event_role_icon_modal').setTitle(`Icono: ${trimTitle(context.role.name)}`);
  const iconInput = new TextInputBuilder()
    .setCustomId('panel_event_role_icon_value')
    .setLabel('Unicode o <:nombre:id> / <a:nombre:id>')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80)
    .setPlaceholder('Ej: ✅  o  <:maegu:123456789012345678>')
    .setValue(context.role.emoji ? String(context.role.emoji).slice(0, 80) : '');

  modal.addComponents(new ActionRowBuilder().addComponents(iconInput));
  await interaction.showModal(modal);
}

async function handleEventRoleIconClear(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  context.role.emoji = null;
  context.role.emojiSource = null;
  const updated = updateWar(context.war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  await updateWithContext(
    interaction,
    {
      ...buildEventRolesEditorPayload(updated, context.roleIndex),
      content: `Icono removido para **${updated.roles[context.roleIndex].name}**.`
    },
    updated.id,
    { currentView: 'roles' }
  );
}

async function handleEventRoleIconBack(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  await updateWithContext(
    interaction,
    buildEventRolesEditorPayload(context.war, context.roleIndex),
    context.war.id,
    { currentView: 'roles' }
  );
}

async function handleEventRolePermissions(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.reply({ content: context.message, flags: 64 });
  }

  await updateWithContext(
    interaction,
    buildRolePermissionsPickerPayload(context.war, context.role),
    context.war.id,
    {
      currentView: 'role_permissions',
      pendingPermissionIds: Array.isArray(context.role.allowedRoleIds) ? [...context.role.allowedRoleIds] : []
    }
  );
}

async function handleEventRolePermissionsSelect(interaction) {
  if (!interaction.isRoleSelectMenu()) return;
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  const selectedIds = (interaction.values || []).map(String);
  const selectedText = selectedIds.length ? selectedIds.map(roleId => `<@&${roleId}>`).join(', ') : 'Sin restricciones';
  await updateWithContext(
    interaction,
    buildRolePermissionsPickerPayload(context.war, context.role, `Seleccion temporal: ${selectedText}`),
    context.war.id,
    { currentView: 'role_permissions', pendingPermissionIds: selectedIds }
  );
}

async function handleEventRolePermissionsConfirm(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  const selectedContext = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const selectedIds = Array.isArray(selectedContext?.pendingPermissionIds) ? selectedContext.pendingPermissionIds : [];
  context.role.allowedRoleIds = selectedIds;
  context.role.allowedRoles = selectedIds
    .map(roleId => interaction.guild?.roles.cache?.get(roleId)?.name)
    .filter(Boolean);

  const updated = updateWar(context.war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  await updateWithContext(
    interaction,
    { ...buildEventRolesEditorPayload(updated, context.roleIndex), content: 'Permisos actualizados correctamente.' },
    updated.id,
    { currentView: 'roles', pendingPermissionIds: null }
  );
}

async function handleEventRolePermissionsClear(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  context.role.allowedRoleIds = [];
  context.role.allowedRoles = [];
  const updated = updateWar(context.war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  await updateWithContext(
    interaction,
    { ...buildEventRolesEditorPayload(updated, context.roleIndex), content: 'Permisos limpiados.' },
    updated.id,
    { currentView: 'roles', pendingPermissionIds: [] }
  );
}

async function handleEventRolePermissionsBack(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  await updateWithContext(
    interaction,
    buildEventRolesEditorPayload(context.war, context.roleIndex),
    context.war.id,
    { currentView: 'roles', pendingPermissionIds: null }
  );
}

async function handleEventRoleDelete(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.reply({ content: context.message, flags: 64 });
  }

  const removed = context.war.roles.splice(context.roleIndex, 1)[0];
  const nextIndex = context.war.roles.length > 0
    ? Math.max(0, Math.min(context.roleIndex, context.war.roles.length - 1))
    : null;

  const updated = updateWar(context.war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  await updateWithContext(
    interaction,
    { ...buildEventRolesEditorPayload(updated, nextIndex), content: `Rol eliminado: **${removed.name}**` },
    updated.id,
    { selectedRoleIndex: nextIndex, currentView: 'roles' }
  );
}

async function handleEventDataEditBasic(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.reply({ content: 'No hay evento seleccionado. Usa `/event edit`.', flags: 64 });
  }
  await showEditDataBasicModal(interaction, war);
}

async function handleEventDataEditClose(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.reply({ content: 'No hay evento seleccionado. Usa `/event edit`.', flags: 64 });
  }
  await showEditCloseModal(interaction, war);
}

async function handleEventDataEditRecap(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.reply({ content: 'No hay evento seleccionado. Usa `/event edit`.', flags: 64 });
  }
  await showEditRecapModal(interaction, war);
}

async function handleEventDataEditSchedule(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.reply({ content: 'No hay evento seleccionado. Usa `/event edit`.', flags: 64 });
  }
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, { currentView: 'data' });
  await showEditScheduleModal(interaction, war);
}

async function handleEventDataEditMentions(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }
  const ctx = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(
    interaction,
    buildEventDataEditorPayload(
      war,
      ctx?.scope || null,
      'La edicion de menciones/publicacion completa se mantiene en el flujo actual de publicacion. Esta vista queda integrada para mantener continuidad.'
    ),
    war.id,
    { currentView: 'data' }
  );
}

async function updateWithContext(interaction, payload, eventId, contextPatch = {}) {
  await interaction.update(payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, eventId, {
    panelMessageId: interaction.message?.id || null,
    ...contextPatch
  });
}

function getSelectedWar(interaction) {
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  if (!context?.eventId) return null;
  return findWarByIdAndChannel(context.eventId, interaction.channelId);
}

function getSelectedRoleContext(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return { ok: false, message: 'No hay evento seleccionado. Usa `/event edit`.' };
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const roleIndex = context?.selectedRoleIndex;
  if (!Number.isInteger(roleIndex)) {
    return { ok: false, message: 'Primero selecciona un rol en el editor.' };
  }

  const role = war.roles?.[roleIndex];
  if (!role) {
    return { ok: false, message: 'El rol seleccionado ya no existe. Selecciona otro rol.' };
  }

  return { ok: true, war, role, roleIndex };
}

function findWarByIdAndChannel(eventId, channelId) {
  return loadWars().find(war => war.id === String(eventId) && war.channelId === channelId) || null;
}

function listChannelWars(channelId) {
  return loadWars().filter(war => war.channelId === channelId);
}

function setPendingAction(interaction, eventId, action) {
  const current = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, eventId, {
    scope: current?.scope || 'series',
    selectedRoleIndex: current?.selectedRoleIndex,
    pendingAction: action
  });
}

async function showEditDataBasicModal(interaction, war) {
  const modal = new ModalBuilder().setCustomId('panel_event_edit_data_basic_modal').setTitle(`Editar datos: ${trimTitle(war.name)}`);

  const nameInput = new TextInputBuilder()
    .setCustomId('panel_event_edit_data_name')
    .setLabel('Nombre del evento')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(90)
    .setValue(String(war.name || '').slice(0, 90));

  const typeInput = new TextInputBuilder()
    .setCustomId('panel_event_edit_data_type')
    .setLabel('Descripcion')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setValue(String(war.type || '').slice(0, 100));

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(typeInput)
  );

  await interaction.showModal(modal);
}

async function showEditCloseModal(interaction, war) {
  const modal = new ModalBuilder().setCustomId('panel_event_edit_close_modal').setTitle(`Cierre: ${trimTitle(war.name)}`);

  const closeInput = new TextInputBuilder()
    .setCustomId('panel_event_edit_close_value')
    .setLabel('Minutos antes de iniciar (0 = no cerrar)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4)
    .setValue(String(Number.isInteger(war.closeBeforeMinutes) ? war.closeBeforeMinutes : 0));

  modal.addComponents(new ActionRowBuilder().addComponents(closeInput));
  await interaction.showModal(modal);
}

async function showEditRecapModal(interaction, war) {
  const modal = new ModalBuilder().setCustomId('panel_event_edit_recap_modal').setTitle(`Hilo final: ${trimTitle(war.name)}`);

  const minutesInput = new TextInputBuilder()
    .setCustomId('panel_event_edit_recap_minutes')
    .setLabel('Minutos antes de borrar (0 = desactivar)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4)
    .setValue(String(Number.isInteger(war.recap?.minutesBeforeExpire) ? war.recap.minutesBeforeExpire : 0));

  const messageInput = new TextInputBuilder()
    .setCustomId('panel_event_edit_recap_message')
    .setLabel('Mensaje del hilo final')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(250)
    .setValue(String(war.recap?.messageText || '').slice(0, 250));

  modal.addComponents(
    new ActionRowBuilder().addComponents(minutesInput),
    new ActionRowBuilder().addComponents(messageInput)
  );
  await interaction.showModal(modal);
}

async function showEditScheduleModal(interaction, war) {
  const modal = new ModalBuilder().setCustomId('panel_event_edit_schedule_modal').setTitle(`Editar horario: ${trimTitle(war.name)}`);

  const timeInput = new TextInputBuilder()
    .setCustomId('panel_event_edit_schedule_time')
    .setLabel('Hora (HH:mm)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5)
    .setValue(String(war.time || '22:00').slice(0, 5));

  const dayInput = new TextInputBuilder()
    .setCustomId('panel_event_edit_schedule_day')
    .setLabel('Dia de semana (0-6)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1)
    .setValue(Number.isInteger(war.dayOfWeek) ? String(war.dayOfWeek) : '0');

  modal.addComponents(
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(dayInput)
  );

  await interaction.showModal(modal);
}

async function fetchGuildEmojiOptions(interaction) {
  const cache = interaction.guild?.emojis?.cache;
  if (!cache) return [];

  if (cache.size === 0 && interaction.guild.emojis.fetch) {
    await interaction.guild.emojis.fetch().catch(() => null);
  }

  return Array.from(interaction.guild.emojis.cache.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
    .map(emoji => ({
      label: emoji.name.slice(0, 100),
      value: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
      emoji: { id: emoji.id, name: emoji.name, animated: emoji.animated }
    }));
}

function parseRoleIconInput(value, guild) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsed = parseEmojiInput(raw, guild);
  if (!parsed) return null;

  if (parsed.emojiSource === 'unicode' && /[A-Za-z0-9]/.test(raw)) {
    return null;
  }

  return parsed;
}

function trimTitle(text) {
  const value = String(text || '').trim();
  return value.length <= 45 ? value : `${value.slice(0, 42)}...`;
}

const EVENT_ADMIN_PANEL_ACTIONS = {
  panel_event_select: handleEventSelect,
  panel_event_list_refresh: handleEventListRefresh,
  panel_event_back_to_list: handleEventBackToList,
  panel_event_exit: handleEventExit,
  panel_event_back_to_panel: handleEventBackToPanel,
  panel_event_view_details: handleEventViewDetails,
  panel_event_edit_roles: handleEventEditRoles,
  panel_event_edit_data: handleEventEditData,
  panel_event_edit_schedule: handleEventEditSchedule,
  panel_event_scope_select: handleEventScopeSelect,
  panel_event_publish_update: handleEventPublishUpdate,
  panel_event_cancel: handleEventCancel,
  panel_event_cancel_confirm: handleEventCancelConfirm,
  panel_event_role_select: handleEventRoleSelect,
  panel_event_role_add: handleEventRoleAdd,
  panel_event_role_rename: handleEventRoleRename,
  panel_event_role_slots: handleEventRoleSlots,
  panel_event_role_icon: handleEventRoleIcon,
  panel_event_role_icon_pick: handleEventRoleIconPick,
  panel_event_role_icon_modal_open: handleEventRoleIconModalOpen,
  panel_event_role_icon_clear: handleEventRoleIconClear,
  panel_event_role_icon_back: handleEventRoleIconBack,
  panel_event_role_permissions: handleEventRolePermissions,
  panel_event_role_permissions_select: handleEventRolePermissionsSelect,
  panel_event_role_permissions_confirm: handleEventRolePermissionsConfirm,
  panel_event_role_permissions_clear: handleEventRolePermissionsClear,
  panel_event_role_permissions_back: handleEventRolePermissionsBack,
  panel_event_role_delete: handleEventRoleDelete,
  panel_event_data_edit_basic: handleEventDataEditBasic,
  panel_event_data_edit_close: handleEventDataEditClose,
  panel_event_data_edit_recap: handleEventDataEditRecap,
  panel_event_data_edit_schedule: handleEventDataEditSchedule,
  panel_event_data_edit_mentions: handleEventDataEditMentions
};

module.exports = {
  EVENT_ADMIN_PANEL_ACTIONS
};
