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
  buildEventMentionsEditorPayload,
  buildEventMentionsPickerPayload,
  buildEventPanelPayload,
  buildPostEditActivationPayload,
  buildEventRolesEditorPayload,
  buildSeriesScheduleManagerPayload,
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
const { normalizeClassIconSource } = require('../../utils/participantDisplayFormatter');
const { listSeriesWars, removeSeriesDay } = require('../../services/recurrenceSeriesService');
const { publishOrRefreshWarWithOptions } = require('../../services/eventPublicationService');
const { moveRoleIndex } = require('../../services/roleOrderService');

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
    if (scope === 'series' && war.schedule?.mode !== 'once') {
      await openSeriesScheduleManager(interaction, war);
      return;
    }
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

  const ctx = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(
    interaction,
    {
      ...buildEventPanelPayload(war, { scope: ctx?.scope || null }),
      content: 'La publicacion directa desde este panel fue desactivada. Usa `/event publish` o el flujo post-edicion (Guardar cambios y activar).'
    },
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

async function handleEventFinishKeep(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  clearSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await interaction.update({
    content: 'Cambios guardados sin publicar. Editor cerrado.',
    embeds: [],
    components: []
  });
}

async function handleEventFinishPublish(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const useSeries = context?.scope === 'series' && war.schedule?.mode !== 'once' && war.groupId;
  const targets = useSeries
    ? loadWars().filter(entry => entry.groupId === war.groupId && entry.channelId === interaction.channelId)
    : [war];

  let published = 0;
  let updated = 0;
  let failed = 0;

  for (const target of targets) {
    const result = await publishOrRefreshWarWithOptions(interaction, target, { activate: true });
    if (!result.ok) {
      failed += 1;
      continue;
    }
    if (result.status === 'published') published += 1;
    if (result.status === 'updated') updated += 1;
  }

  clearSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const scopeLabel = useSeries ? 'toda la serie' : 'solo esta ocurrencia';
  await interaction.update({
    content: `Cambios guardados y publicacion ejecutada (${scopeLabel}). Publicados: ${published}, actualizados: ${updated}, fallidos: ${failed}.`,
    embeds: [],
    components: []
  });
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
  const updated = await updateWar(war);
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

  const source = resolveEventRoleIconSource(interaction, context.war);
  await ensureIconSourcesLoaded(interaction, source);
  const payload = await buildEventRoleIconPickerView(interaction, context.war, context.role, source, '', 0);
  await updateWithContext(interaction, payload, context.war.id, {
    currentView: 'role_icon',
    pendingIconSource: source,
    pendingIconPage: 0
  });
}

async function handleEventRoleIconSource(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  const source = normalizeClassIconSource(interaction.values?.[0]);
  const sourceChanged = normalizeClassIconSource(context.war.classIconSource) !== source;
  context.war.classIconSource = source;
  const updatedWar = sourceChanged ? await updateWar(context.war) : context.war;
  if (sourceChanged && updatedWar.messageId) {
    await refreshWarMessage(interaction, updatedWar);
  }

  await ensureIconSourcesLoaded(interaction, source);
  const payload = await buildEventRoleIconPickerView(interaction, updatedWar, context.role, source, '', 0);
  await updateWithContext(interaction, payload, updatedWar.id, {
    currentView: 'role_icon',
    pendingIconSource: source,
    pendingIconPage: 0
  });
}

async function handleEventRoleIconPick(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  const emojiId = String(interaction.values?.[0] || '').trim();
  const emoji = interaction.guild?.emojis?.cache?.get(emojiId);
  if (!emoji) {
    const source = resolveEventRoleIconSource(interaction, context.war);
    await ensureIconSourcesLoaded(interaction, source);
    const payload = await buildEventRoleIconPickerView(
      interaction,
      context.war,
      context.role,
      source,
      'Emoji invalido. Selecciona uno del servidor o escribe uno manualmente.'
    );
    await updateWithContext(interaction, payload, context.war.id, { currentView: 'role_icon' });
    return;
  }

  const inline = `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  context.role.emoji = inline;
  context.role.emojiSource = 'guild';
  const updated = await updateWar(context.war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  await updateWithContext(
    interaction,
    {
      ...buildEventRolesEditorPayload(updated, context.roleIndex),
      content: `Icono guardado para **${updated.roles[context.roleIndex].name}**: ${inline}`
    },
    updated.id,
    { currentView: 'roles' }
  );
}

async function handleEventRoleIconBotPick(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  const emojiId = String(interaction.values?.[0] || '').trim();
  const appEmojis = await fetchApplicationEmojis(interaction);
  const emoji = appEmojis.find(entry => String(entry.id) === emojiId);
  if (!emoji) {
    const payload = await buildEventRoleIconPickerView(
      interaction,
      context.war,
      context.role,
      'bot',
      'No se pudo usar ese icono del bot. Vuelve a intentarlo.'
    );
    await updateWithContext(interaction, payload, context.war.id, { currentView: 'role_icon' });
    return;
  }

  context.role.emoji = `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  context.role.emojiSource = 'application';
  const updated = await updateWar(context.war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  await updateWithContext(
    interaction,
    {
      ...buildEventRolesEditorPayload(updated, context.roleIndex),
      content: `Icono guardado para **${updated.roles[context.roleIndex].name}**: ${context.role.emoji}`
    },
    updated.id,
    { currentView: 'roles' }
  );
}

async function handleEventRoleIconBotPage(interaction, delta) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  const emojis = await fetchApplicationEmojis(interaction);
  const totalPages = Math.max(1, Math.ceil(emojis.length / 25));
  const current = resolveEventRoleIconPage(interaction);
  const next = Math.max(0, Math.min(totalPages - 1, current + delta));
  const payload = await buildEventRoleIconPickerView(interaction, context.war, context.role, 'bot', '', next);

  await updateWithContext(interaction, payload, context.war.id, {
    currentView: 'role_icon',
    pendingIconSource: 'bot',
    pendingIconPage: next
  });
}

async function handleEventRoleIconBotPrev(interaction) {
  return await handleEventRoleIconBotPage(interaction, -1);
}

async function handleEventRoleIconBotNext(interaction) {
  return await handleEventRoleIconBotPage(interaction, 1);
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
  const updated = await updateWar(context.war);
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

  const updated = await updateWar(context.war);
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
  const updated = await updateWar(context.war);
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

  const updated = await updateWar(context.war);
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

async function handleEventRoleMove(interaction, direction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) {
    return await interaction.update({ content: context.message, embeds: [], components: [] });
  }

  const result = moveRoleIndex(context.war.roles, context.roleIndex, direction);
  if (!result.moved) {
    const reason = direction === 'up'
      ? 'Ese rol ya esta al inicio.'
      : 'Ese rol ya esta al final.';
    await updateWithContext(
      interaction,
      { ...buildEventRolesEditorPayload(context.war, context.roleIndex), content: reason },
      context.war.id,
      { selectedRoleIndex: context.roleIndex, currentView: 'roles' }
    );
    return;
  }

  context.war.roles = result.roles;
  const updated = await updateWar(context.war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  const movedRoleName = updated.roles[result.toIndex]?.name || 'rol';
  const actionLabel = direction === 'up' ? 'arriba' : 'abajo';
  await updateWithContext(
    interaction,
    {
      ...buildEventRolesEditorPayload(updated, result.toIndex),
      content: `Orden actualizado: **${movedRoleName}** movido hacia ${actionLabel}.`
    },
    updated.id,
    { selectedRoleIndex: result.toIndex, currentView: 'roles' }
  );
}

async function handleEventRoleMoveUp(interaction) {
  return await handleEventRoleMove(interaction, 'up');
}

async function handleEventRoleMoveDown(interaction) {
  return await handleEventRoleMove(interaction, 'down');
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
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, {
    currentView: 'data',
    pendingScheduleReturnView: 'data'
  });
  if (context?.scope === 'series' && war.schedule?.mode !== 'once') {
    await openSeriesScheduleManager(interaction, war);
    return;
  }
  await showEditScheduleModal(interaction, war);
}

async function openSeriesScheduleManager(interaction, war, notice = '') {
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const series = listSeriesWars(war, interaction.channelId);
  const selectedEventId = context?.pendingScheduleTargetEventId || war.id;
  await updateWithContext(
    interaction,
    buildSeriesScheduleManagerPayload(war, series, { selectedEventId, notice }),
    war.id,
    {
      currentView: 'schedule_series',
      pendingScheduleTargetEventId: selectedEventId,
      pendingScheduleReturnView: context?.pendingScheduleReturnView || context?.currentView || 'panel'
    }
  );
}

async function handleEventScheduleSeriesSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const targetEventId = String(interaction.values?.[0] || '').trim();
  const series = listSeriesWars(war, interaction.channelId);
  const selected = series.find(entry => entry.id === targetEventId);
  const notice = selected
    ? `Seleccionado: ${['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'][selected.dayOfWeek] || '?'} ${selected.time || '--:--'}`
    : 'No se pudo seleccionar esa ocurrencia.';

  await updateWithContext(
    interaction,
    buildSeriesScheduleManagerPayload(war, series, { selectedEventId: targetEventId, notice }),
    war.id,
    {
      currentView: 'schedule_series',
      pendingScheduleTargetEventId: selected ? targetEventId : (series[0]?.id || null)
    }
  );
}

async function handleEventScheduleSeriesAdd(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.reply({ content: 'No hay evento seleccionado. Usa `/event edit`.', flags: 64 });
  }

  const modal = new ModalBuilder().setCustomId('panel_event_schedule_series_add_modal').setTitle(`Agregar dia: ${trimTitle(war.name)}`);
  const timeInput = new TextInputBuilder()
    .setCustomId('panel_event_schedule_series_time')
    .setLabel('Hora (HH:mm)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5)
    .setValue(String(war.time || '22:00').slice(0, 5));

  const daysInput = new TextInputBuilder()
    .setCustomId('panel_event_schedule_series_days')
    .setLabel('Dias de semana (0-6, separados por ;)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)
    .setPlaceholder('Ej: 0;2;4')
    .setValue(Number.isInteger(war.dayOfWeek) ? String(war.dayOfWeek) : '0');

  modal.addComponents(
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(daysInput)
  );
  await interaction.showModal(modal);
}

async function handleEventScheduleSeriesEdit(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.reply({ content: 'No hay evento seleccionado. Usa `/event edit`.', flags: 64 });
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const series = listSeriesWars(war, interaction.channelId);
  const target = series.find(entry => entry.id === context?.pendingScheduleTargetEventId) || null;
  if (!target) {
    return await openSeriesScheduleManager(interaction, war, 'Selecciona primero la ocurrencia que quieres editar.');
  }

  const modal = new ModalBuilder().setCustomId('panel_event_schedule_series_edit_modal').setTitle(`Editar dia: ${trimTitle(war.name)}`);
  const timeInput = new TextInputBuilder()
    .setCustomId('panel_event_schedule_series_time')
    .setLabel('Hora (HH:mm)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5)
    .setValue(String(target.time || '22:00').slice(0, 5));

  const dayInput = new TextInputBuilder()
    .setCustomId('panel_event_schedule_series_day')
    .setLabel('Dia de semana (0-6)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1)
    .setValue(Number.isInteger(target.dayOfWeek) ? String(target.dayOfWeek) : '0');

  modal.addComponents(
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(dayInput)
  );
  await interaction.showModal(modal);
}

async function handleEventScheduleSeriesDelete(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const series = listSeriesWars(war, interaction.channelId);
  const target = series.find(entry => entry.id === context?.pendingScheduleTargetEventId) || null;
  if (!target) {
    return await openSeriesScheduleManager(interaction, war, 'Selecciona primero la ocurrencia que quieres eliminar.');
  }

  if (series.length <= 1) {
    return await openSeriesScheduleManager(interaction, war, 'No puedes eliminar el ultimo dia de la serie.');
  }

  try {
    const removed = await removeSeriesDay(war, interaction.channelId, target.id);
    if (removed.messageId) {
      const channel = await interaction.guild?.channels?.fetch(removed.channelId).catch(() => null);
      if (channel?.messages?.fetch) {
        const message = await channel.messages.fetch(removed.messageId).catch(() => null);
        if (message) {
          await message.delete().catch(() => null);
        }
      }
    }

    const updatedSeries = listSeriesWars(war, interaction.channelId);
    const nextSelected = updatedSeries[0];
    const nextWar = nextSelected || war;

    await updateWithContext(
      interaction,
      buildSeriesScheduleManagerPayload(nextWar, updatedSeries, {
        selectedEventId: nextSelected?.id || null,
        notice: 'Dia eliminado de la serie.'
      }),
      nextWar.id,
      {
        currentView: 'schedule_series',
        pendingScheduleTargetEventId: nextSelected?.id || null
      }
    );
  } catch (error) {
    await openSeriesScheduleManager(interaction, war, error?.message || 'No se pudo eliminar el dia de la serie.');
  }
}

async function handleEventScheduleSeriesBack(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const returnView = context?.pendingScheduleReturnView;
  if (returnView === 'data') {
    await updateWithContext(interaction, buildEventDataEditorPayload(war, context?.scope || null), war.id, {
      currentView: 'data',
      pendingScheduleTargetEventId: null,
      pendingScheduleReturnView: null
    });
    return;
  }

  await updateWithContext(interaction, buildEventPanelPayload(war, { scope: context?.scope || null }), war.id, {
    currentView: 'panel',
    pendingScheduleTargetEventId: null,
    pendingScheduleReturnView: null
  });
}

async function handleEventPostEditActivate(interaction) {
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const eventIds = Array.isArray(context?.pendingActivationEventIds)
    ? context.pendingActivationEventIds.map(String).filter(Boolean)
    : [];
  if (!eventIds.length) {
    const war = getSelectedWar(interaction);
    if (!war) {
      return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
    }
    await updateWithContext(interaction, buildEventPanelPayload(war, { scope: context?.scope || null }), war.id, { currentView: 'panel' });
    return;
  }

  let published = 0;
  let updated = 0;
  let failed = 0;
  let lastWar = null;

  for (const eventId of eventIds) {
    const war = findWarByIdAndChannel(eventId, interaction.channelId);
    if (!war) {
      failed += 1;
      continue;
    }

    const result = await publishOrRefreshWarWithOptions(interaction, war, { activate: true });
    if (!result.ok) {
      failed += 1;
      continue;
    }
    if (result.status === 'published') published += 1;
    if (result.status === 'updated') updated += 1;
    lastWar = result.war || war;
  }

  const fallbackWarId = eventIds[0];
  const fallbackWar = findWarByIdAndChannel(fallbackWarId, interaction.channelId);
  const viewWar = lastWar || fallbackWar;
  if (!viewWar) {
    return await interaction.update({
      content: `Cambios aplicados. Activacion finalizada. Publicados: ${published}, actualizados: ${updated}, fallidos: ${failed}.`,
      embeds: [],
      components: []
    });
  }

  const scope = context?.scope || null;
  const notice = `Cambios aplicados y activacion completada. Publicados: ${published}, actualizados: ${updated}, fallidos: ${failed}.`;
  const returnView = context?.pendingActivationReturnView;
  if (returnView === 'mentions') {
    await updateWithContext(
      interaction,
      { ...buildEventMentionsEditorPayload(viewWar, scope), content: notice },
      viewWar.id,
      {
        currentView: 'mentions',
        pendingActivationEventIds: null,
        pendingActivationReturnView: null
      }
    );
    return;
  }

  if (returnView === 'panel') {
    await updateWithContext(
      interaction,
      { ...buildEventPanelPayload(viewWar, { scope }), content: notice },
      viewWar.id,
      {
        currentView: 'panel',
        pendingActivationEventIds: null,
        pendingActivationReturnView: null
      }
    );
    return;
  }

  await updateWithContext(
    interaction,
    { ...buildEventDataEditorPayload(viewWar, scope, notice) },
    viewWar.id,
    {
      currentView: 'data',
      pendingActivationEventIds: null,
      pendingActivationReturnView: null
    }
  );
}

async function handleEventPostEditKeep(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const scope = context?.scope || null;
  const returnView = context?.pendingActivationReturnView;
  const notice = 'Cambios guardados sin activar/publicar.';

  if (returnView === 'mentions') {
    await updateWithContext(
      interaction,
      { ...buildEventMentionsEditorPayload(war, scope), content: notice },
      war.id,
      {
        currentView: 'mentions',
        pendingActivationEventIds: null,
        pendingActivationReturnView: null
      }
    );
    return;
  }

  if (returnView === 'panel') {
    await updateWithContext(
      interaction,
      { ...buildEventPanelPayload(war, { scope }), content: notice },
      war.id,
      {
        currentView: 'panel',
        pendingActivationEventIds: null,
        pendingActivationReturnView: null
      }
    );
    return;
  }

  await updateWithContext(
    interaction,
    buildEventDataEditorPayload(war, scope, notice),
    war.id,
    {
      currentView: 'data',
      pendingActivationEventIds: null,
      pendingActivationReturnView: null
    }
  );
}

async function handleEventDataEditMentions(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }
  const ctx = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(
    interaction,
    buildEventMentionsEditorPayload(war, ctx?.scope || null),
    war.id,
    { currentView: 'mentions' }
  );
}

async function handleEventMentionsEdit(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const selected = Array.isArray(war.notifyRoles) ? war.notifyRoles : [];
  await updateWithContext(
    interaction,
    buildEventMentionsPickerPayload(war, selected),
    war.id,
    { currentView: 'mentions_picker', pendingMentionRoleIds: selected }
  );
}

async function handleEventMentionsSelect(interaction) {
  if (!interaction.isRoleSelectMenu()) return;
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const selectedIds = (interaction.values || []).map(String);
  await updateWithContext(
    interaction,
    buildEventMentionsPickerPayload(
      war,
      selectedIds,
      selectedIds.length ? `Seleccion temporal: ${selectedIds.map(id => `<@&${id}>`).join(', ')}` : 'Sin menciones seleccionadas.'
    ),
    war.id,
    { currentView: 'mentions_picker', pendingMentionRoleIds: selectedIds }
  );
}

async function handleEventMentionsSave(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const selectedIds = Array.isArray(context?.pendingMentionRoleIds) ? context.pendingMentionRoleIds : [];
  war.notifyRoles = selectedIds;

  const updated = await updateWar(war);
  if (updated.messageId) {
    await refreshWarMessage(interaction, updated);
  }

  await updateWithContext(
    interaction,
    buildEventMentionsEditorPayload(
      updated,
      context?.scope || null,
      selectedIds.length
        ? `Menciones guardadas: ${selectedIds.map(id => `<@&${id}>`).join(', ')}`
        : 'Menciones limpiadas para este evento.'
    ),
    updated.id,
    { currentView: 'mentions', pendingMentionRoleIds: null }
  );
}

async function handleEventMentionsBack(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(
    interaction,
    buildEventMentionsEditorPayload(war, context?.scope || null),
    war.id,
    { currentView: 'mentions', pendingMentionRoleIds: null }
  );
}

async function handleEventMentionsRecap(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.reply({ content: 'No hay evento seleccionado. Usa `/event edit`.', flags: 64 });
  }

  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, {
    currentView: 'mentions'
  });
  await showEditRecapModal(interaction, war);
}

async function handleEventMentionsToData(interaction) {
  const war = getSelectedWar(interaction);
  if (!war) {
    return await interaction.update({ content: 'No hay evento seleccionado. Usa `/event edit`.', embeds: [], components: [] });
  }

  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  await updateWithContext(
    interaction,
    buildEventDataEditorPayload(war, context?.scope || null),
    war.id,
    { currentView: 'data', pendingMentionRoleIds: null }
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

function shouldOfferPostEditDecision(wars) {
  if (!Array.isArray(wars) || wars.length === 0) return false;
  const nowMs = Date.now();
  return wars.some(war => {
    const expired = Number.isFinite(war.expiresAt) && war.expiresAt > 0 && nowMs >= war.expiresAt;
    return Boolean(war.isClosed || !war.messageId || expired);
  });
}

async function showPostEditActivationDecision(interaction, baseWar, options = {}) {
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const scope = context?.scope || 'single';
  const eventIds = Array.isArray(options.eventIds) ? options.eventIds.map(String).filter(Boolean) : [baseWar.id];
  const returnView = options.returnView || 'data';
  const notice = options.notice || 'Cambios guardados.';

  await updateWithContext(
    interaction,
    buildPostEditActivationPayload(baseWar, { scope, notice }),
    baseWar.id,
    {
      currentView: 'post_edit_activation',
      pendingActivationEventIds: eventIds,
      pendingActivationReturnView: returnView
    }
  );
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

  const durationInput = new TextInputBuilder()
    .setCustomId('panel_event_edit_data_duration')
    .setLabel('Duracion en minutos (1-1440)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4)
    .setValue(String(Number.isInteger(war.duration) ? war.duration : 70));

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(typeInput),
    new ActionRowBuilder().addComponents(durationInput)
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

async function buildEventRoleIconPickerView(interaction, war, role, source, notice = '', forcedPage = null) {
  const selectedSource = normalizeClassIconSource(source);
  const botPage = resolveEventRoleIconPage(interaction, forcedPage);
  const guildEmojiOptions = await fetchGuildEmojiOptions(interaction);
  const appEmojis = selectedSource === 'bot' ? await fetchApplicationEmojis(interaction) : getApplicationEmojiCache(interaction);
  const botTotalPages = Math.max(1, Math.ceil(appEmojis.length / 25));
  const safePage = Math.max(0, Math.min(botTotalPages - 1, botPage));
  const botEmojiOptions = appEmojis
    .slice(safePage * 25, safePage * 25 + 25)
    .map(emoji => ({
      label: String(emoji.name).slice(0, 100),
      value: String(emoji.id),
      emoji: { id: emoji.id, name: emoji.name, animated: emoji.animated }
    }));

  return buildRoleIconPickerPayload(war, role, {
    source: selectedSource,
    guildLabel: interaction.guild?.name || 'Servidor',
    guildEmojiOptions,
    botEmojiOptions,
    botPage: safePage,
    botTotalPages,
    notice
  });
}

function resolveEventRoleIconSource(interaction, war) {
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  const rawSource = String(context?.pendingIconSource || '').trim().toLowerCase();
  if (rawSource === 'guild' || rawSource === 'bot') {
    return rawSource;
  }
  return normalizeClassIconSource(war?.classIconSource);
}

function resolveEventRoleIconPage(interaction, forcedPage = null) {
  if (Number.isInteger(forcedPage) && forcedPage >= 0) return forcedPage;
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  return Number.isInteger(context?.pendingIconPage) && context.pendingIconPage >= 0
    ? context.pendingIconPage
    : 0;
}

async function ensureIconSourcesLoaded(interaction, source) {
  const normalized = normalizeClassIconSource(source);
  if (normalized === 'guild') {
    await interaction.guild?.emojis?.fetch().catch(() => null);
    return;
  }
  await fetchApplicationEmojis(interaction);
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
  panel_event_finish_keep: handleEventFinishKeep,
  panel_event_finish_publish: handleEventFinishPublish,
  panel_event_publish_update: handleEventPublishUpdate,
  panel_event_cancel: handleEventCancel,
  panel_event_cancel_confirm: handleEventCancelConfirm,
  panel_event_role_select: handleEventRoleSelect,
  panel_event_role_add: handleEventRoleAdd,
  panel_event_role_rename: handleEventRoleRename,
  panel_event_role_slots: handleEventRoleSlots,
  panel_event_role_icon: handleEventRoleIcon,
  panel_event_role_icon_source: handleEventRoleIconSource,
  panel_event_role_icon_pick: handleEventRoleIconPick,
  panel_event_role_icon_bot_pick: handleEventRoleIconBotPick,
  panel_event_role_icon_bot_prev: handleEventRoleIconBotPrev,
  panel_event_role_icon_bot_next: handleEventRoleIconBotNext,
  panel_event_role_icon_modal_open: handleEventRoleIconModalOpen,
  panel_event_role_icon_clear: handleEventRoleIconClear,
  panel_event_role_icon_back: handleEventRoleIconBack,
  panel_event_role_permissions: handleEventRolePermissions,
  panel_event_role_permissions_select: handleEventRolePermissionsSelect,
  panel_event_role_permissions_confirm: handleEventRolePermissionsConfirm,
  panel_event_role_permissions_clear: handleEventRolePermissionsClear,
  panel_event_role_permissions_back: handleEventRolePermissionsBack,
  panel_event_role_move_up: handleEventRoleMoveUp,
  panel_event_role_move_down: handleEventRoleMoveDown,
  panel_event_role_delete: handleEventRoleDelete,
  panel_event_data_edit_basic: handleEventDataEditBasic,
  panel_event_data_edit_close: handleEventDataEditClose,
  panel_event_data_edit_recap: handleEventDataEditRecap,
  panel_event_data_edit_schedule: handleEventDataEditSchedule,
  panel_event_schedule_series_select: handleEventScheduleSeriesSelect,
  panel_event_schedule_series_add: handleEventScheduleSeriesAdd,
  panel_event_schedule_series_edit: handleEventScheduleSeriesEdit,
  panel_event_schedule_series_delete: handleEventScheduleSeriesDelete,
  panel_event_schedule_series_back: handleEventScheduleSeriesBack,
  panel_event_post_edit_activate: handleEventPostEditActivate,
  panel_event_post_edit_keep: handleEventPostEditKeep,
  panel_event_data_edit_mentions: handleEventDataEditMentions,
  panel_event_mentions_edit: handleEventMentionsEdit,
  panel_event_mentions_select: handleEventMentionsSelect,
  panel_event_mentions_save: handleEventMentionsSave,
  panel_event_mentions_back: handleEventMentionsBack,
  panel_event_mentions_recap: handleEventMentionsRecap,
  panel_event_mentions_to_data: handleEventMentionsToData
};

module.exports = {
  EVENT_ADMIN_PANEL_ACTIONS,
  shouldOfferPostEditDecision,
  showPostEditActivationDecision
};
