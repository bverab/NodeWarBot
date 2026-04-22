const { parseEmojiInput } = require('../../utils/emojiHelper');
const { loadWars, updateWar } = require('../../services/warService');
const { getSelectedEventContext, setSelectedEventContext } = require('../../utils/eventAdminContextStore');
const { refreshWarMessage } = require('../../commands/eventadminShared');
const { isValidTime } = require('../../utils/cronHelper');
const {
  buildEventDataEditorPayload,
  buildEventMentionsEditorPayload,
  buildSeriesScheduleManagerPayload,
  buildEventPanelPayload,
  buildEventRolesEditorPayload
} = require('../../utils/eventAdminUi');
const { addSeriesDays, editSeriesDay, listSeriesWars } = require('../../services/recurrenceSeriesService');
const {
  shouldOfferPostEditDecision,
  showPostEditActivationDecision
} = require('../interaction/eventAdminPanelActions');

async function handleEventRoleAddModal(interaction) {
  const context = getSelectedWarContext(interaction);
  if (!context.ok) return await safeModalReply(interaction, { content: context.message });

  const name = interaction.fields.getTextInputValue('panel_event_role_add_name')?.trim();
  const slotsRaw = interaction.fields.getTextInputValue('panel_event_role_add_slots')?.trim();
  const iconRaw = interaction.fields.getTextInputValue('panel_event_role_add_icon')?.trim();

  const slots = Number.parseInt(slotsRaw, 10);
  if (!name) return await safeModalReply(interaction, { content: 'Nombre invalido.' });
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

  const newName = interaction.fields.getTextInputValue('panel_event_role_rename_name')?.trim();
  if (!newName) return await safeModalReply(interaction, { content: 'Nombre invalido.' });

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

  const slotsRaw = interaction.fields.getTextInputValue('panel_event_role_slots_value')?.trim();
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

  const iconRaw = interaction.fields.getTextInputValue('panel_event_role_icon_value')?.trim() || '';
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

  const name = interaction.fields.getTextInputValue('panel_event_edit_data_name')?.trim();
  const type = interaction.fields.getTextInputValue('panel_event_edit_data_type')?.trim() || '';
  if (!name) return await safeModalReply(interaction, { content: 'Nombre invalido.' });

  const targets = getScopeTargets(context.war, context.context.scope, interaction.channelId);
  const targetIds = targets.map(war => war.id);
  for (const war of targets) {
    war.name = name;
    war.type = type || war.type;
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

  const closeRaw = interaction.fields.getTextInputValue('panel_event_edit_close_value')?.trim();
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

  const minutesRaw = interaction.fields.getTextInputValue('panel_event_edit_recap_minutes')?.trim();
  const messageText = interaction.fields.getTextInputValue('panel_event_edit_recap_message')?.trim() || '';
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

  const time = interaction.fields.getTextInputValue('panel_event_edit_schedule_time')?.trim();
  const dayRaw = interaction.fields.getTextInputValue('panel_event_edit_schedule_day')?.trim();
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

  const time = interaction.fields.getTextInputValue('panel_event_schedule_series_time')?.trim();
  const daysRaw = interaction.fields.getTextInputValue('panel_event_schedule_series_days')?.trim();

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

  const time = interaction.fields.getTextInputValue('panel_event_schedule_series_time')?.trim();
  const dayRaw = interaction.fields.getTextInputValue('panel_event_schedule_series_day')?.trim();
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
  if (interaction.replied || interaction.deferred) {
    try {
      await interaction.editReply(payload);
      return;
    } catch (error) {
      if (error?.code !== 10062 && error?.code !== 40060) {
        throw error;
      }
      return;
    }
  }

  await interaction.reply({ flags: 64, ...payload });
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
  panel_event_schedule_series_edit_modal: handleEventScheduleSeriesEditModal
};

module.exports = {
  EVENT_ADMIN_MODAL_ACTIONS
};
