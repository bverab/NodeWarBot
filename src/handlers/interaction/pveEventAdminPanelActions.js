const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { loadWars, updateWar } = require('../../services/warService');
const pveService = require('../../services/pveService');
const { normalizeEventType } = require('../../constants/eventTypes');
const {
  buildPveAccessEditorPayload,
  buildPveSlotsEditorPayload,
  buildPveEnrollmentsEditorPayload,
  buildEventPanelPayload
} = require('../../utils/eventAdminUi');
const { refreshWarMessage } = require('../../commands/eventadminShared');
const { getSelectedEventContext, setSelectedEventContext } = require('../../utils/eventAdminContextStore');

function getSelectedPveContext(interaction) {
  const context = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  if (!context?.eventId) return { ok: false, message: 'No hay evento seleccionado. Usa `/event edit`.' };
  const war = loadWars().find(entry => entry.id === String(context.eventId) && entry.channelId === interaction.channelId) || null;
  if (!war) return { ok: false, message: 'El evento seleccionado ya no existe.' };
  if (normalizeEventType(war.eventType) !== 'pve') return { ok: false, message: 'Este flujo solo aplica a eventos PvE.' };
  return { ok: true, war, context };
}

async function updateWithContext(interaction, payload, eventId, contextPatch = {}) {
  await interaction.update(payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, eventId, {
    panelMessageId: interaction.message?.id || null,
    ...contextPatch
  });
}

async function refreshIfPublished(interaction, war) {
  if (war?.messageId) {
    await refreshWarMessage(interaction, war);
  }
}

async function handlePveEditAccess(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  await updateWithContext(
    interaction,
    buildPveAccessEditorPayload(context.war),
    context.war.id,
    { currentView: 'pve_access' }
  );
}

async function handlePveToggleClose(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  context.war.isClosed = !context.war.isClosed;
  const updated = await updateWar(context.war);
  await refreshIfPublished(interaction, updated);

  const notice = updated.isClosed
    ? 'Inscripciones PvE cerradas desde el panel.'
    : 'Inscripciones PvE reactivadas desde el panel.';

  await updateWithContext(
    interaction,
    {
      ...buildEventPanelPayload(updated, { scope: context.context.scope || null }),
      content: notice
    },
    updated.id,
    { currentView: 'panel' }
  );
}

async function handlePveAccessModeSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const mode = interaction.values?.[0] === 'RESTRICTED' ? 'RESTRICTED' : 'OPEN';
  context.war.accessMode = mode;
  const updated = await updateWar(context.war);
  await refreshIfPublished(interaction, updated);

  await updateWithContext(
    interaction,
    buildPveAccessEditorPayload(updated, { notice: `Modo actualizado: ${mode}` }),
    updated.id,
    { currentView: 'pve_access' }
  );
}

async function handlePveAccessUsersSelect(interaction) {
  if (!interaction.isUserSelectMenu()) return;
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const userIds = Array.from(new Set((interaction.values || []).map(String).filter(Boolean)));
  context.war.allowedUserIds = userIds;
  const updated = await updateWar(context.war);
  await refreshIfPublished(interaction, updated);

  await updateWithContext(
    interaction,
    buildPveAccessEditorPayload(updated, { notice: 'Usuarios permitidos actualizados.' }),
    updated.id,
    { currentView: 'pve_access', pendingAllowedUserIds: userIds }
  );
}

async function handlePveAccessBack(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  await updateWithContext(
    interaction,
    buildEventPanelPayload(context.war, { scope: context.context.scope || null }),
    context.war.id,
    { currentView: 'panel', pendingAllowedUserIds: null }
  );
}

async function renderSlotsEditor(interaction, war, context, notice = '') {
  const view = await pveService.getEventPveView(war);
  const selectedOptionId = context?.pendingPveOptionId || (view.options[0] ? view.options[0].id : null);
  await updateWithContext(
    interaction,
    buildPveSlotsEditorPayload(war, view, { selectedOptionId, notice }),
    war.id,
    { currentView: 'pve_slots', pendingPveOptionId: selectedOptionId }
  );
}

async function handlePveEditSlots(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });
  await renderSlotsEditor(interaction, context.war, context.context);
}

async function handlePveSlotsSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const selectedOptionId = String(interaction.values?.[0] || '').trim();
  const view = await pveService.getEventPveView(context.war);
  await updateWithContext(
    interaction,
    buildPveSlotsEditorPayload(context.war, view, { selectedOptionId }),
    context.war.id,
    { currentView: 'pve_slots', pendingPveOptionId: selectedOptionId }
  );
}

async function handlePveSlotAdd(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.reply({ content: context.message, flags: 64 });

  const modal = new ModalBuilder().setCustomId('panel_pve_slot_add_modal').setTitle(`Agregar horario: ${trimTitle(context.war.name)}`);
  const timeInput = new TextInputBuilder()
    .setCustomId('panel_pve_slot_time')
    .setLabel('Hora (HH:mm)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);
  const capInput = new TextInputBuilder()
    .setCustomId('panel_pve_slot_capacity')
    .setLabel('Cupo (1-500)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue('5');

  modal.addComponents(
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(capInput)
  );
  await interaction.showModal(modal);
}

async function handlePveSlotEdit(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.reply({ content: context.message, flags: 64 });

  const optionId = context.context.pendingPveOptionId;
  if (!optionId) return await interaction.reply({ content: 'Selecciona un horario primero.', flags: 64 });

  const view = await pveService.getEventPveView(context.war);
  const option = view.options.find(entry => String(entry.id) === String(optionId));
  if (!option) return await interaction.reply({ content: 'El horario seleccionado ya no existe.', flags: 64 });

  const modal = new ModalBuilder().setCustomId('panel_pve_slot_edit_modal').setTitle(`Editar horario: ${trimTitle(context.war.name)}`);
  const timeInput = new TextInputBuilder()
    .setCustomId('panel_pve_slot_time')
    .setLabel('Hora (HH:mm)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5)
    .setValue(String(option.time || '').slice(0, 5));
  const capInput = new TextInputBuilder()
    .setCustomId('panel_pve_slot_capacity')
    .setLabel('Cupo (1-500)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue(String(option.capacity || 1));

  modal.addComponents(
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(capInput)
  );
  await interaction.showModal(modal);
}

async function handlePveSlotDelete(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const optionId = context.context.pendingPveOptionId;
  if (!optionId) return await interaction.reply({ content: 'Selecciona un horario primero.', flags: 64 });

  await pveService.deleteSlot(context.war.id, optionId);
  const updated = loadWars().find(entry => entry.id === context.war.id && entry.channelId === interaction.channelId) || context.war;
  await refreshIfPublished(interaction, updated);
  await renderSlotsEditor(interaction, updated, { ...context.context, pendingPveOptionId: null }, 'Horario eliminado.');
}

async function handlePveSlotMove(interaction, direction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const optionId = context.context.pendingPveOptionId;
  if (!optionId) return await interaction.reply({ content: 'Selecciona un horario primero.', flags: 64 });

  await pveService.moveSlot(context.war.id, optionId, direction);
  const updated = loadWars().find(entry => entry.id === context.war.id && entry.channelId === interaction.channelId) || context.war;
  await refreshIfPublished(interaction, updated);
  await renderSlotsEditor(interaction, updated, context.context, `Horario movido ${direction === 'up' ? 'hacia arriba' : 'hacia abajo'}.`);
}

async function handlePveSlotsBack(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  await updateWithContext(
    interaction,
    buildEventPanelPayload(context.war, { scope: context.context.scope || null }),
    context.war.id,
    { currentView: 'panel', pendingPveOptionId: null }
  );
}

async function renderEnrollmentsEditor(interaction, war, context, notice = '') {
  const view = await pveService.getEventPveView(war);
  const selectedOptionId = context?.pendingPveOptionId || (view.options[0] ? view.options[0].id : null);
  await updateWithContext(
    interaction,
    buildPveEnrollmentsEditorPayload(war, view, {
      selectedOptionId,
      selectedEnrollmentKey: context?.pendingPveEnrollmentKey || null,
      notice
    }),
    war.id,
    { currentView: 'pve_enrollments', pendingPveOptionId: selectedOptionId }
  );
}

async function handlePveManageEnrollments(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });
  await renderEnrollmentsEditor(interaction, context.war, context.context);
}

async function handlePveEnrollSlotSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const selectedOptionId = String(interaction.values?.[0] || '').trim();
  const view = await pveService.getEventPveView(context.war);
  await updateWithContext(
    interaction,
    buildPveEnrollmentsEditorPayload(context.war, view, { selectedOptionId }),
    context.war.id,
    { currentView: 'pve_enrollments', pendingPveOptionId: selectedOptionId, pendingPveEnrollmentKey: null }
  );
}

async function handlePveEnrollUserSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const selectedEnrollmentKey = String(interaction.values?.[0] || '').trim();
  const view = await pveService.getEventPveView(context.war);
  await updateWithContext(
    interaction,
    buildPveEnrollmentsEditorPayload(context.war, view, {
      selectedOptionId: context.context.pendingPveOptionId,
      selectedEnrollmentKey
    }),
    context.war.id,
    { currentView: 'pve_enrollments', pendingPveEnrollmentKey: selectedEnrollmentKey }
  );
}

function parseEnrollmentKey(value) {
  const [typeRaw, userIdRaw] = String(value || '').split(':');
  const userId = String(userIdRaw || '').trim();
  if (!userId) return null;
  const enrollmentType = String(typeRaw || 'PRIMARY').toUpperCase() === 'FILLER' ? 'FILLER' : 'PRIMARY';
  return { enrollmentType, userId };
}

async function handlePveEnrollRemove(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const optionId = context.context.pendingPveOptionId;
  const parsed = parseEnrollmentKey(context.context.pendingPveEnrollmentKey);
  if (!optionId || !parsed) {
    return await interaction.reply({ content: 'Selecciona un inscrito/filler primero.', flags: 64 });
  }

  await pveService.removeEnrollment(context.war.id, optionId, parsed.userId);
  const updated = loadWars().find(entry => entry.id === context.war.id && entry.channelId === interaction.channelId) || context.war;
  await refreshIfPublished(interaction, updated);
  await renderEnrollmentsEditor(interaction, updated, { ...context.context, pendingPveEnrollmentKey: null }, 'Participante removido del horario.');
}

async function handlePveEnrollPromote(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  const optionId = context.context.pendingPveOptionId;
  const parsed = parseEnrollmentKey(context.context.pendingPveEnrollmentKey);
  if (!optionId || !parsed) {
    return await interaction.reply({ content: 'Selecciona un filler primero.', flags: 64 });
  }

  const result = await pveService.promoteFiller(context.war.id, optionId, parsed.userId);
  const updated = loadWars().find(entry => entry.id === context.war.id && entry.channelId === interaction.channelId) || context.war;
  await refreshIfPublished(interaction, updated);
  const notice = result.ok ? 'Filler promovido a inscrito normal.' : `No se pudo promover (${result.reason}).`;
  await renderEnrollmentsEditor(interaction, updated, context.context, notice);
}

async function handlePveEnrollMove(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.reply({ content: context.message, flags: 64 });

  const parsed = parseEnrollmentKey(context.context.pendingPveEnrollmentKey);
  const optionId = context.context.pendingPveOptionId;
  if (!optionId || !parsed) return await interaction.reply({ content: 'Selecciona un inscrito/filler primero.', flags: 64 });

  const modal = new ModalBuilder().setCustomId('panel_pve_enroll_move_modal').setTitle(`Mover inscrito: ${trimTitle(context.war.name)}`);
  const timeInput = new TextInputBuilder()
    .setCustomId('panel_pve_enroll_target_time')
    .setLabel('Horario destino (HH:mm)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);

  modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
  await interaction.showModal(modal);
}

async function handlePveEnrollAdd(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.reply({ content: context.message, flags: 64 });

  const modal = new ModalBuilder().setCustomId('panel_pve_enroll_add_modal').setTitle(`Agregar inscrito: ${trimTitle(context.war.name)}`);
  const userInput = new TextInputBuilder()
    .setCustomId('panel_pve_enroll_add_user_id')
    .setLabel('Discord userId')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);
  const displayInput = new TextInputBuilder()
    .setCustomId('panel_pve_enroll_add_display')
    .setLabel('Nickname')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);
  const typeInput = new TextInputBuilder()
    .setCustomId('panel_pve_enroll_add_type')
    .setLabel('Tipo (PRIMARY/FILLER)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue('PRIMARY')
    .setMaxLength(8);
  const timeInput = new TextInputBuilder()
    .setCustomId('panel_pve_enroll_add_time')
    .setLabel('Horario destino HH:mm (opcional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(5);

  modal.addComponents(
    new ActionRowBuilder().addComponents(userInput),
    new ActionRowBuilder().addComponents(displayInput),
    new ActionRowBuilder().addComponents(typeInput),
    new ActionRowBuilder().addComponents(timeInput)
  );
  await interaction.showModal(modal);
}

async function handlePveEnrollmentsBack(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await interaction.update({ content: context.message, embeds: [], components: [] });

  await updateWithContext(
    interaction,
    buildEventPanelPayload(context.war, { scope: context.context.scope || null }),
    context.war.id,
    { currentView: 'panel', pendingPveOptionId: null, pendingPveEnrollmentKey: null }
  );
}

function trimTitle(text) {
  const value = String(text || '').trim();
  return value.length <= 45 ? value : `${value.slice(0, 42)}...`;
}

const PVE_EVENT_ADMIN_PANEL_ACTIONS = {
  panel_pve_toggle_close: handlePveToggleClose,
  panel_pve_edit_slots: handlePveEditSlots,
  panel_pve_slots_select: handlePveSlotsSelect,
  panel_pve_slot_add: handlePveSlotAdd,
  panel_pve_slot_edit: handlePveSlotEdit,
  panel_pve_slot_delete: handlePveSlotDelete,
  panel_pve_slot_up: async interaction => handlePveSlotMove(interaction, 'up'),
  panel_pve_slot_down: async interaction => handlePveSlotMove(interaction, 'down'),
  panel_pve_slots_back: handlePveSlotsBack,
  panel_pve_edit_access: handlePveEditAccess,
  panel_pve_access_mode_select: handlePveAccessModeSelect,
  panel_pve_access_users_select: handlePveAccessUsersSelect,
  panel_pve_access_back: handlePveAccessBack,
  panel_pve_manage_enrollments: handlePveManageEnrollments,
  panel_pve_enroll_slot_select: handlePveEnrollSlotSelect,
  panel_pve_enroll_user_select: handlePveEnrollUserSelect,
  panel_pve_enroll_remove: handlePveEnrollRemove,
  panel_pve_enroll_promote: handlePveEnrollPromote,
  panel_pve_enroll_move: handlePveEnrollMove,
  panel_pve_enroll_add: handlePveEnrollAdd,
  panel_pve_enrollments_back: handlePveEnrollmentsBack
};

module.exports = {
  PVE_EVENT_ADMIN_PANEL_ACTIONS,
  getSelectedPveContext
};
