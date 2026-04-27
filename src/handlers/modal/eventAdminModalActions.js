const { parseEmojiInput } = require('../../utils/emojiHelper');
const { loadWars, updateWar } = require('../../services/warService');
const pveService = require('../../services/pveService');
const eventManagementService = require('../../services/eventManagementService');
const { sanitizeUserInput, sanitizeDisplayText, safeMessageContent } = require('../../utils/textSafety');
const { logWarn } = require('../../utils/appLogger');
const { getSelectedEventContext, setSelectedEventContext } = require('../../utils/eventAdminContextStore');
const { refreshWarMessage } = require('../../commands/eventadminShared');
const { isValidTime } = require('../../utils/cronHelper');
const {
  buildEventDataEditorPayload,
  buildEventMentionsEditorPayload,
  buildSeriesScheduleManagerPayload,
  buildEventPanelPayload,
  buildEventRolesEditorPayload,
  buildPveSlotsEditorPayload,
  buildPveEnrollmentsEditorPayload
} = require('../../utils/eventAdminUi');
const { addSeriesDays, editSeriesDay, listSeriesWars } = require('../../services/recurrenceSeriesService');
const {
  shouldOfferPostEditDecision,
  showPostEditActivationDecision
} = require('../interaction/eventAdminPanelActions');
const { getSelectedPveContext } = require('../interaction/pveEventAdminPanelActions');

async function handleEventRoleAddModal(interaction) {
  const context = getSelectedWarContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const nameInput = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_role_add_name'), {
    maxLength: 60,
    fallback: ''
  });
  const slotsRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_role_add_slots'), {
    maxLength: 3,
    fallback: ''
  }).value;
  const iconRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_role_add_icon'), {
    maxLength: 80,
    allowEmpty: true
  }).value;
  const name = nameInput.value;

  const slots = Number.parseInt(slotsRaw, 10);
  if (!name) return await safeModalReply(interaction, { content: 'Nombre invalido.' });
  if (nameInput.hadMassMentions) {
    logWarn('Mention masiva neutralizada en alta de rol', { userId: interaction.user?.id, guildId: interaction.guildId });
  }
  if (!Number.isInteger(slots) || slots < 1 || slots > 999) {
    return await safeModalReply(interaction, { content: 'Slots invalidos. Deben estar entre 1 y 999.' });
  }
  if (context.war.roles.some(role => String(role.name).toLowerCase() === name.toLowerCase())) {
    return await safeModalReply(interaction, { content: `Ya existe un rol llamado **${name}**.` });
  }

  let parsed = null;
  if (iconRaw) {
    parsed = parseRoleIconInput(iconRaw, interaction.guild);
    if (!parsed) {
      return await safeModalReply(interaction, { content: 'Icono invalido. Usa unicode o <:nombre:id>.' });
    }
  }

  context.war.roles.push({
    name,
    max: slots,
    emoji: parsed?.emoji || null,
    emojiSource: parsed?.emojiSource || null,
    users: [],
    allowedRoleIds: [],
    allowedRoles: []
  });

  const updated = await updateWar(context.war);
  if (updated.messageId) await refreshWarMessage(interaction, updated);
  const selectedRoleIndex = updated.roles.length - 1;

  await replyWithRolesEditor(interaction, updated, selectedRoleIndex, `Rol agregado: **${name}** (${slots})`);
}

async function handleEventRoleRenameModal(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const newNameInput = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_role_rename_name'), {
    maxLength: 60,
    fallback: ''
  });
  const newName = newNameInput.value;
  if (!newName) return await safeModalReply(interaction, { content: 'Nombre invalido.' });
  if (newNameInput.hadMassMentions) {
    logWarn('Mention masiva neutralizada en rename de rol', { userId: interaction.user?.id, guildId: interaction.guildId });
  }

  if (context.war.roles.some((role, idx) =>
    idx !== context.roleIndex && String(role.name).toLowerCase() === newName.toLowerCase()
  )) {
    return await safeModalReply(interaction, { content: `Ya existe un rol llamado **${newName}**.` });
  }

  const previousName = context.role.name;
  context.role.name = newName;
  context.war.waitlist = context.war.waitlist.map(entry => (
    entry.roleName === previousName ? { ...entry, roleName: newName } : entry
  ));

  const updated = await updateWar(context.war);
  if (updated.messageId) await refreshWarMessage(interaction, updated);
  await replyWithRolesEditor(interaction, updated, context.roleIndex, `Rol renombrado: **${previousName}** -> **${newName}**`);
}

async function handleEventRoleSlotsModal(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const slotsRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_role_slots_value'), {
    maxLength: 3,
    fallback: ''
  }).value;
  const slots = Number.parseInt(slotsRaw, 10);
  if (!Number.isInteger(slots) || slots < 1 || slots > 999) {
    return await safeModalReply(interaction, { content: 'Slots invalidos. Deben estar entre 1 y 999.' });
  }

  const usersCount = Array.isArray(context.role.users) ? context.role.users.length : 0;
  if (usersCount > slots) {
    return await safeModalReply(interaction, { content: `No puedes bajar a ${slots}; hay ${usersCount} inscritos.` });
  }

  context.role.max = slots;
  const updated = await updateWar(context.war);
  if (updated.messageId) await refreshWarMessage(interaction, updated);
  await replyWithRolesEditor(interaction, updated, context.roleIndex, `Slots actualizados para **${context.role.name}**: ${slots}`);
}

async function handleEventRoleIconModal(interaction) {
  const context = getSelectedRoleContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const iconRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_role_icon_value'), {
    maxLength: 80,
    allowEmpty: true
  }).value || '';
  if (!iconRaw) {
    context.role.emoji = null;
    context.role.emojiSource = null;
  } else {
    const parsed = parseRoleIconInput(iconRaw, interaction.guild);
    if (!parsed) {
      return await safeModalReply(interaction, { content: 'Icono invalido. Usa unicode o <:nombre:id> o <a:nombre:id>.' });
    }
    context.role.emoji = parsed.emoji;
    context.role.emojiSource = parsed.emojiSource;
  }

  const updated = await updateWar(context.war);
  if (updated.messageId) await refreshWarMessage(interaction, updated);
  await replyWithRolesEditor(interaction, updated, context.roleIndex, `Icono actualizado para **${context.role.name}**.`);
}

async function handleEventEditDataBasicModal(interaction) {
  const context = getSelectedWarContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const nameInput = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_edit_data_name'), {
    maxLength: 90,
    fallback: ''
  });
  const typeInput = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_edit_data_type'), {
    maxLength: 100,
    allowEmpty: true
  });
  const durationRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_edit_data_duration'), {
    maxLength: 4,
    fallback: ''
  }).value;
  const name = nameInput.value;
  const type = typeInput.value || '';
  const duration = Number.parseInt(durationRaw, 10);
  if (!name) return await safeModalReply(interaction, { content: 'Nombre invalido.' });
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
    return await safeModalReply(interaction, { content: 'Duracion invalida. Debe estar entre 1 y 1440.' });
  }

  const targets = getScopeTargets(context.war, context.context.scope, interaction.channelId);
  const targetIds = targets.map(war => war.id);
  for (const war of targets) {
    war.name = name;
    war.type = type || war.type;
    war.duration = duration;
    const updated = await updateWar(war);
    if (updated.messageId) await refreshWarMessage(interaction, updated);
  }

  const refreshedWars = loadWars().filter(war => targetIds.includes(war.id) && war.channelId === interaction.channelId);
  const refreshed = refreshedWars.find(war => war.id === context.war.id) || context.war;
  const scopeLabel = context.context.scope === 'series' ? 'toda la serie' : 'esta ocurrencia';
  const notice = `Nombre y descripcion actualizados (${scopeLabel}).`;
  if (shouldOfferPostEditDecision(refreshedWars)) {
    await showPostEditActivationDecision(interaction, refreshed, {
      eventIds: refreshedWars.map(war => war.id),
      returnView: 'data',
      notice
    });
    return;
  }
  await replyWithDataEditor(interaction, refreshed, context.context.scope, notice);
}

async function handleEventEditCloseModal(interaction) {
  const context = getSelectedWarContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const closeRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_edit_close_value'), {
    maxLength: 4,
    fallback: ''
  }).value;
  const closeBefore = Number.parseInt(closeRaw, 10);
  const duration = Number.isInteger(context.war.duration) ? context.war.duration : 1440;
  if (!Number.isInteger(closeBefore) || closeBefore < 0 || closeBefore >= duration) {
    return await safeModalReply(interaction, { content: `Cierre invalido. Usa 0 a ${Math.max(0, duration - 1)}.` });
  }

  const targets = getScopeTargets(context.war, context.context.scope, interaction.channelId);
  const targetIds = targets.map(war => war.id);
  for (const war of targets) {
    war.closeBeforeMinutes = closeBefore;
    const updated = await updateWar(war);
    if (updated.messageId) await refreshWarMessage(interaction, updated);
  }

  const refreshedWars = loadWars().filter(war => targetIds.includes(war.id) && war.channelId === interaction.channelId);
  const refreshed = refreshedWars.find(war => war.id === context.war.id) || context.war;
  const scopeLabel = context.context.scope === 'series' ? 'toda la serie' : 'esta ocurrencia';
  const notice = `Cierre de inscripciones actualizado (${scopeLabel}).`;
  if (shouldOfferPostEditDecision(refreshedWars)) {
    await showPostEditActivationDecision(interaction, refreshed, {
      eventIds: refreshedWars.map(war => war.id),
      returnView: 'data',
      notice
    });
    return;
  }
  await replyWithDataEditor(interaction, refreshed, context.context.scope, notice);
}

async function handleEventEditRecapModal(interaction) {
  const context = getSelectedWarContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const minutesRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_edit_recap_minutes'), {
    maxLength: 4,
    fallback: ''
  }).value;
  const messageText = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_edit_recap_message'), {
    maxLength: 250,
    allowEmpty: true
  }).value || '';
  const minutesBeforeExpire = Number.parseInt(minutesRaw, 10);
  if (!Number.isInteger(minutesBeforeExpire) || minutesBeforeExpire < 0 || minutesBeforeExpire > 1440) {
    return await safeModalReply(interaction, { content: 'Tiempo de borrado invalido. Usa 0 a 1440.' });
  }

  const targets = getScopeTargets(context.war, context.context.scope, interaction.channelId);
  const targetIds = targets.map(war => war.id);
  for (const war of targets) {
    if (!war.recap || typeof war.recap !== 'object') {
      war.recap = { enabled: false, minutesBeforeExpire: 0, messageText: '', threadId: null, lastPostedAt: null };
    }
    war.recap.minutesBeforeExpire = minutesBeforeExpire;
    war.recap.messageText = messageText;
    war.recap.enabled = minutesBeforeExpire > 0;
    const updated = await updateWar(war);
    if (updated.messageId) await refreshWarMessage(interaction, updated);
  }

  const refreshedWars = loadWars().filter(war => targetIds.includes(war.id) && war.channelId === interaction.channelId);
  const refreshed = refreshedWars.find(war => war.id === context.war.id) || context.war;
  const scopeLabel = context.context.scope === 'series' ? 'toda la serie' : 'esta ocurrencia';
  const notice = `Configuracion de hilo final actualizada (${scopeLabel}).`;
  if (shouldOfferPostEditDecision(refreshedWars)) {
    await showPostEditActivationDecision(interaction, refreshed, {
      eventIds: refreshedWars.map(war => war.id),
      returnView: context.context.currentView === 'mentions' || context.context.currentView === 'mentions_picker' ? 'mentions' : 'data',
      notice
    });
    return;
  }
  if (context.context.currentView === 'mentions' || context.context.currentView === 'mentions_picker') {
    await replyWithMentionsEditor(interaction, refreshed, context.context.scope, notice);
    return;
  }
  await replyWithDataEditor(interaction, refreshed, context.context.scope, notice);
}

async function handleEventEditScheduleModal(interaction) {
  const context = getSelectedWarContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const time = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_edit_schedule_time'), {
    maxLength: 5,
    fallback: ''
  }).value;
  const dayRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_edit_schedule_day'), {
    maxLength: 2,
    fallback: ''
  }).value;
  const day = Number.parseInt(dayRaw, 10);

  if (!isValidTime(time)) {
    return await safeModalReply(interaction, { content: 'Hora invalida. Usa HH:mm.' });
  }
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return await safeModalReply(interaction, { content: 'Dia invalido. Usa un numero entre 0 y 6.' });
  }

  const targets = getScopeTargets(context.war, context.context.scope, interaction.channelId);
  const targetIds = targets.map(war => war.id);
  for (const war of targets) {
    war.time = time;
    war.dayOfWeek = day;
    if (!war.schedule) {
      war.schedule = { enabled: false, mode: 'recurring' };
    }
    const updated = await updateWar(war);
    if (updated.messageId) await refreshWarMessage(interaction, updated);
  }

  const refreshedWars = loadWars().filter(war => targetIds.includes(war.id) && war.channelId === interaction.channelId);
  const refreshed = refreshedWars.find(war => war.id === context.war.id) || context.war;
  const scopeLabel = context.context.scope === 'series' ? 'toda la serie' : 'esta ocurrencia';
  const notice = `Horario actualizado (${scopeLabel}): dia ${day}, ${time}.`;
  if (shouldOfferPostEditDecision(refreshedWars)) {
    await showPostEditActivationDecision(interaction, refreshed, {
      eventIds: refreshedWars.map(war => war.id),
      returnView: context.context.currentView === 'data' ? 'data' : 'panel',
      notice
    });
    return;
  }
  if (context.context.currentView === 'data') {
    await replyWithDataEditor(interaction, refreshed, context.context.scope, notice);
    return;
  }
  await replyWithEventPanel(interaction, refreshed, context.context.scope, notice);
}

async function handleEventScheduleSeriesAddModal(interaction) {
  const context = getSelectedWarContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const time = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_schedule_series_time'), {
    maxLength: 5,
    fallback: ''
  }).value;
  const daysRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_schedule_series_days'), {
    maxLength: 64,
    fallback: ''
  }).value;

  try {
    const result = await addSeriesDays(context.war, interaction.channelId, time, daysRaw);
    const targetWar = result.createdWars[0] || context.war;
    const series = listSeriesWars(targetWar, interaction.channelId);
    const selectedEventId = result.createdWars[0]?.id || context.context.pendingScheduleTargetEventId || context.war.id;

    const summary = [];
    if (result.addedDays.length > 0) summary.push(`Agregados: ${result.addedDays.join(', ')}`);
    if (result.ignoredExistingDays.length > 0) summary.push(`Ya existian: ${result.ignoredExistingDays.join(', ')}`);
    if (result.duplicateInputDays.length > 0) summary.push(`Repetidos en input: ${result.duplicateInputDays.join(', ')}`);
    if (result.invalidTokens.length > 0) summary.push(`Invalidos: ${result.invalidTokens.join(', ')}`);
    if (summary.length === 0) summary.push('No se agregaron dias.');

    await replyWithSeriesScheduleManager(interaction, targetWar, series, selectedEventId, summary.join(' | '));
  } catch (error) {
    const series = listSeriesWars(context.war, interaction.channelId);
    await replyWithSeriesScheduleManager(
      interaction,
      context.war,
      series,
      context.context.pendingScheduleTargetEventId || context.war.id,
      error?.message || 'No se pudieron agregar dias.'
    );
  }
}

async function handleEventScheduleSeriesEditModal(interaction) {
  const context = getSelectedWarContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const targetEventId = String(context.context.pendingScheduleTargetEventId || '').trim();
  if (!targetEventId) {
    const series = listSeriesWars(context.war, interaction.channelId);
    return await replyWithSeriesScheduleManager(interaction, context.war, series, context.war.id, 'Selecciona primero la ocurrencia a editar.');
  }

  const time = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_schedule_series_time'), {
    maxLength: 5,
    fallback: ''
  }).value;
  const dayRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_event_schedule_series_day'), {
    maxLength: 2,
    fallback: ''
  }).value;
  const day = Number.parseInt(dayRaw, 10);

  try {
    const updated = await editSeriesDay(context.war, interaction.channelId, targetEventId, time, day);
    if (updated.messageId) {
      await refreshWarMessage(interaction, updated);
    }
    const series = listSeriesWars(updated, interaction.channelId);
    await replyWithSeriesScheduleManager(interaction, updated, series, updated.id, 'Dia de la serie actualizado.');
  } catch (error) {
    const series = listSeriesWars(context.war, interaction.channelId);
    await replyWithSeriesScheduleManager(interaction, context.war, series, targetEventId, error?.message || 'No se pudo editar el dia.');
  }
}

async function handlePveSlotAddModal(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const time = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_slot_time'), {
    maxLength: 5,
    fallback: ''
  }).value;
  const capacity = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_slot_capacity'), {
    maxLength: 3,
    fallback: ''
  }).value;

  try {
    const result = await eventManagementService.addPveSlot(context.war.id, time, capacity, { channelId: interaction.channelId });
    const refreshed = result.event || context.war;
    if (refreshed.messageId) await refreshWarMessage(interaction, refreshed);
    const view = await pveService.getEventPveView(refreshed);
    const selectedOptionId = view.options[view.options.length - 1]?.id || null;
    const payload = buildPveSlotsEditorPayload(refreshed, view, {
      selectedOptionId,
      notice: 'Horario agregado correctamente.'
    });
    const messageId = await respondModalInFlow(interaction, payload);
    setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, refreshed.id, {
      panelMessageId: messageId,
      currentView: 'pve_slots',
      pendingPveOptionId: selectedOptionId
    });
  } catch (error) {
    await safeModalReply(interaction, { content: error?.message || 'No se pudo agregar el horario.' });
  }
}

async function handlePveSlotEditModal(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const optionId = context.context.pendingPveOptionId;
  if (!optionId) return await safeModalReply(interaction, { content: 'Selecciona un horario primero.' });

  const time = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_slot_time'), {
    maxLength: 5,
    fallback: ''
  }).value;
  const capacity = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_slot_capacity'), {
    maxLength: 3,
    fallback: ''
  }).value;

  try {
    const result = await eventManagementService.updatePveSlot(context.war.id, optionId, { time, capacity }, { channelId: interaction.channelId });
    const refreshed = result.event || context.war;
    if (refreshed.messageId) await refreshWarMessage(interaction, refreshed);
    const view = await pveService.getEventPveView(refreshed);
    const payload = buildPveSlotsEditorPayload(refreshed, view, {
      selectedOptionId: optionId,
      notice: 'Horario actualizado correctamente.'
    });
    const messageId = await respondModalInFlow(interaction, payload);
    setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, refreshed.id, {
      panelMessageId: messageId,
      currentView: 'pve_slots',
      pendingPveOptionId: optionId
    });
  } catch (error) {
    await safeModalReply(interaction, { content: error?.message || 'No se pudo editar el horario.' });
  }
}

function findSlotByTime(options, time) {
  return options.find(slot => String(slot.time) === String(time));
}

async function handlePveEnrollMoveModal(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const selectedOptionId = context.context.pendingPveOptionId;
  const selectedKey = String(context.context.pendingPveEnrollmentKey || '');
  const [typeRaw, userIdRaw] = selectedKey.split(':');
  const userId = String(userIdRaw || '').trim();
  if (!selectedOptionId || !userId) {
    return await safeModalReply(interaction, { content: 'Selecciona un inscrito/filler primero.' });
  }

  const targetTime = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_enroll_target_time'), {
    maxLength: 5,
    fallback: ''
  }).value;
  const view = await pveService.getEventPveView(context.war);
  const targetSlot = findSlotByTime(view.options, targetTime);
  if (!targetSlot) {
    return await safeModalReply(interaction, { content: 'No existe un horario con ese HH:mm en este evento.' });
  }

  const movedView = await eventManagementService.movePveEnrollment(
    context.war.id,
    selectedOptionId,
    targetSlot.id,
    userId,
    { channelId: interaction.channelId }
  );
  const moved = movedView.result || { ok: false, reason: movedView.reason };
  const refreshed = movedView.event || context.war;
  if (refreshed.messageId) await refreshWarMessage(interaction, refreshed);

  const updatedView = await pveService.getEventPveView(refreshed);
  const payload = buildPveEnrollmentsEditorPayload(refreshed, updatedView, {
    selectedOptionId: targetSlot.id,
    notice: moved.ok ? 'Inscripcion movida correctamente.' : `No se pudo mover (${moved.reason}).`
  });
  const messageId = await respondModalInFlow(interaction, payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, refreshed.id, {
    panelMessageId: messageId,
    currentView: 'pve_enrollments',
    pendingPveOptionId: targetSlot.id,
    pendingPveEnrollmentKey: null
  });
}

async function handlePveEnrollAddModal(interaction) {
  const context = getSelectedPveContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const userId = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_enroll_add_user_id'), {
    maxLength: 32,
    fallback: ''
  }).value;
  const displayNameInput = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_enroll_add_display'), {
    maxLength: 64,
    fallback: ''
  });
  const displayName = sanitizeDisplayText(displayNameInput.value, { maxLength: 64, fallback: '' });
  const typeRaw = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_enroll_add_type'), {
    maxLength: 8,
    fallback: ''
  }).value;
  const targetTime = sanitizeUserInput(interaction.fields.getTextInputValue('panel_pve_enroll_add_time'), {
    maxLength: 5,
    allowEmpty: true
  }).value;

  if (!userId || !displayName) {
    return await safeModalReply(interaction, { content: 'userId y nickname son requeridos.' });
  }

  const enrollmentType = String(typeRaw || 'PRIMARY').toUpperCase() === 'FILLER' ? 'FILLER' : 'PRIMARY';
  const view = await pveService.getEventPveView(context.war);
  const fallbackSlotId = context.context.pendingPveOptionId || view.options[0]?.id || null;
  const targetSlot = targetTime ? findSlotByTime(view.options, targetTime) : null;
  const optionId = targetSlot?.id || fallbackSlotId;
  if (!optionId) {
    return await safeModalReply(interaction, { content: 'No hay horarios disponibles para agregar inscripcion.' });
  }

  const createdView = await eventManagementService.addPveEnrollment(context.war.id, optionId, {
    userId,
    displayName,
    isFake: false
  }, enrollmentType, { channelId: interaction.channelId });
  const created = createdView.result || { ok: false, reason: createdView.reason };

  const refreshed = createdView.event || context.war;
  if (refreshed.messageId) await refreshWarMessage(interaction, refreshed);

  const updatedView = await pveService.getEventPveView(refreshed);
  const payload = buildPveEnrollmentsEditorPayload(refreshed, updatedView, {
    selectedOptionId: optionId,
    notice: created.ok ? `Inscripcion agregada (${enrollmentType}).` : `No se pudo agregar (${created.reason}).`
  });
  const messageId = await respondModalInFlow(interaction, payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, refreshed.id, {
    panelMessageId: messageId,
    currentView: 'pve_enrollments',
    pendingPveOptionId: optionId,
    pendingPveEnrollmentKey: null
  });
}

async function replyWithRolesEditor(interaction, war, selectedRoleIndex, notice) {
  const payload = {
    ...buildEventRolesEditorPayload(war, selectedRoleIndex),
    content: notice
  };
  const messageId = await respondModalInFlow(interaction, payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, {
    selectedRoleIndex,
    panelMessageId: messageId,
    currentView: 'roles'
  });
}

async function replyWithEventPanel(interaction, war, scope, notice) {
  const payload = {
    ...buildEventPanelPayload(war, { scope }),
    content: notice
  };
  const messageId = await respondModalInFlow(interaction, payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, {
    scope: scope || 'single',
    panelMessageId: messageId,
    currentView: 'panel'
  });
}

async function replyWithDataEditor(interaction, war, scope, notice) {
  const payload = {
    ...buildEventDataEditorPayload(war, scope, notice)
  };
  const messageId = await respondModalInFlow(interaction, payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, {
    scope: scope || 'single',
    panelMessageId: messageId,
    currentView: 'data'
  });
}

async function replyWithMentionsEditor(interaction, war, scope, notice) {
  const payload = {
    ...buildEventMentionsEditorPayload(war, scope, notice)
  };
  const messageId = await respondModalInFlow(interaction, payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, {
    scope: scope || 'single',
    panelMessageId: messageId,
    currentView: 'mentions',
    pendingMentionRoleIds: null
  });
}

async function replyWithSeriesScheduleManager(interaction, war, series, selectedEventId, notice) {
  const payload = {
    ...buildSeriesScheduleManagerPayload(war, series, {
      selectedEventId,
      notice
    })
  };
  const messageId = await respondModalInFlow(interaction, payload);
  setSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId, war.id, {
    panelMessageId: messageId,
    currentView: 'schedule_series',
    pendingScheduleTargetEventId: selectedEventId || null
  });
}

async function respondModalInFlow(interaction, payload) {
  if (typeof interaction.update === 'function') {
    try {
      await interaction.update(payload);
      return interaction.message?.id || null;
    } catch (error) {
      if (error?.code !== 40060 && error?.code !== 10062) {
        throw error;
      }
    }
  }

  const reply = await interaction.reply({ flags: 64, ...payload, fetchReply: true });
  return reply?.id || null;
}

async function safeModalReply(interaction, payload) {
  const sanitizedPayload = payload?.content
    ? { ...payload, content: safeMessageContent(payload.content, 'Accion procesada') }
    : payload;

  if (interaction.replied || interaction.deferred) {
    try {
      await interaction.editReply(sanitizedPayload);
      return;
    } catch (error) {
      if (error?.code !== 10062 && error?.code !== 40060) {
        throw error;
      }
      return;
    }
  }

  await interaction.reply({ flags: 64, ...sanitizedPayload });
}

function getSelectedWarContext(interaction) {
  const ctx = getSelectedEventContext(interaction.user.id, interaction.guildId, interaction.channelId);
  if (!ctx?.eventId) return { ok: false, message: 'No hay evento seleccionado. Usa `/event edit`.' };

  const war = loadWars().find(entry => entry.id === String(ctx.eventId) && entry.channelId === interaction.channelId) || null;
  if (!war) return { ok: false, message: 'El evento seleccionado ya no existe en este canal.' };
  return { ok: true, war, context: ctx };
}

function getSelectedRoleContext(interaction) {
  const base = getSelectedWarContext(interaction);
  if (!base.ok) return base;

  const idx = base.context.selectedRoleIndex;
  if (!Number.isInteger(idx)) return { ok: false, message: 'Primero selecciona un rol en el editor.' };

  const role = base.war.roles?.[idx];
  if (!role) return { ok: false, message: 'El rol seleccionado ya no existe.' };
  return { ok: true, war: base.war, role, roleIndex: idx, context: base.context };
}

function getScopeTargets(baseWar, scope, channelId) {
  if (scope !== 'series' || !baseWar.groupId) {
    return [baseWar];
  }

  const sameSeries = loadWars().filter(war =>
    war.groupId === baseWar.groupId && war.channelId === channelId
  );
  return sameSeries.length ? sameSeries : [baseWar];
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

const EVENT_ADMIN_MODAL_ACTIONS = {
  panel_event_role_add_modal: handleEventRoleAddModal,
  panel_event_role_rename_modal: handleEventRoleRenameModal,
  panel_event_role_slots_modal: handleEventRoleSlotsModal,
  panel_event_role_icon_modal: handleEventRoleIconModal,
  panel_event_edit_data_basic_modal: handleEventEditDataBasicModal,
  panel_event_edit_close_modal: handleEventEditCloseModal,
  panel_event_edit_recap_modal: handleEventEditRecapModal,
  panel_event_edit_schedule_modal: handleEventEditScheduleModal,
  panel_event_schedule_series_add_modal: handleEventScheduleSeriesAddModal,
  panel_event_schedule_series_edit_modal: handleEventScheduleSeriesEditModal,
  panel_pve_slot_add_modal: handlePveSlotAddModal,
  panel_pve_slot_edit_modal: handlePveSlotEditModal,
  panel_pve_enroll_move_modal: handlePveEnrollMoveModal,
  panel_pve_enroll_add_modal: handlePveEnrollAddModal
};

module.exports = {
  EVENT_ADMIN_MODAL_ACTIONS
};
