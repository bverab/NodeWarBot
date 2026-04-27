const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getEventTypeMeta } = require('../constants/eventTypes');
const { createParticipantDisplayFormatter } = require('./participantDisplayFormatter');
const {
  sanitizeDisplayText,
  safeEmbedTitle,
  safeEmbedDescription,
  safeEmbedFieldName,
  safeEmbedFieldValue,
  safeMessageContent
} = require('./textSafety');

function normalizeAccessMode(value) {
  return String(value || 'OPEN').toUpperCase() === 'RESTRICTED' ? 'RESTRICTED' : 'OPEN';
}

function normalizeAllowedUsers(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean)));
}

const ICONS = {
  adventure: '🧭',
  calendar: '📅',
  note: '📝',
  clock: '⏰',
  lock: '🔐',
  whiteCircle: '⚪'
};
const PARTICIPANT_PREFIX = '▏ ';

function renderMembers(entries = [], formatParticipantDisplay) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length <= 0) return '-';
  return list
    .map(entry => `${PARTICIPANT_PREFIX}${sanitizeDisplayText(formatParticipantDisplay(entry), { maxLength: 64, fallback: 'Usuario' })}`)
    .join('\n');
}

function buildPveEmbed(event, view = {}) {
  const eventMeta = getEventTypeMeta(event.eventType);
  const options = Array.isArray(view.options) ? view.options : [];
  const accessMode = normalizeAccessMode(view.accessMode || event.accessMode);
  const allowedUserIds = normalizeAllowedUsers(view.allowedUserIds || event.allowedUserIds);
  const formatParticipantDisplay = createParticipantDisplayFormatter({
    guildId: event.guildId,
    classIconSource: event.classIconSource,
    participantDisplayStyle: event.participantDisplayStyle
  });

  const startsAt = Math.floor((event.createdAt || Date.now()) / 1000);
  const endsAt = Math.floor((event.expiresAt || event.closesAt || Date.now()) / 1000);
  const closesAt = Number.isFinite(event.closesAt) ? `<t:${Math.floor(event.closesAt / 1000)}:R>` : 'sin cierre';
  const totalPrimary = options.reduce((acc, option) => acc + ((option.enrollments || []).length), 0);
  const totalFillers = options.reduce((acc, option) => acc + ((option.fillers || []).length), 0);

  const accessText = accessMode === 'RESTRICTED'
    ? (allowedUserIds.length ? allowedUserIds.map(userId => `<@${userId}>`).join(' ') : 'Restringido (sin usuarios configurados)')
    : 'Open (sin restriccion)';

  const description = [
    `${ICONS.calendar} **Horario**`,
    `<t:${startsAt}:F> - <t:${endsAt}:t>`,
    `<t:${startsAt}:R>`,
    sanitizeDisplayText(event.type, { maxLength: 120, fallback: 'Contenido PvE' }),
    '',
    `${ICONS.note} **Inscripciones**`,
    event.isClosed ? 'Cerradas' : `Abiertas (cierran ${closesAt})`,
    `Primarios: **${totalPrimary}** | Fillers: **${totalFillers}**`,
    `${ICONS.lock} **Acceso**: ${accessText}`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle(safeEmbedTitle(`${ICONS.adventure} ${sanitizeDisplayText(event.name, { maxLength: 90, fallback: 'Evento PvE' })} (${eventMeta.label})`, `${ICONS.adventure} Evento PvE`))
    .setDescription(safeEmbedDescription(description))
    .setColor(0x2ecc71);

  if (!options.length) {
    embed.addFields({ name: 'Horarios', value: safeEmbedFieldValue('Sin horarios configurados'), inline: false });
  } else {
    const limited = options.slice(0, 18);
    for (let index = 0; index < limited.length; index += 1) {
      const option = limited[index];
      const primaryMembers = renderMembers(option.enrollments, formatParticipantDisplay);

      embed.addFields({
        name: safeEmbedFieldName(`${ICONS.clock} ${sanitizeDisplayText(option.label, { maxLength: 60, fallback: 'Horario' })} (${option.enrollments.length}/${option.capacity})`),
        value: safeEmbedFieldValue(primaryMembers),
        inline: true
      });

      if ((index + 1) % 3 === 0 && index < limited.length - 1) {
        embed.addFields({ name: '\u200b', value: '\u200b', inline: false });
      }
    }

    const hasAnyFillers = limited.some(option => Array.isArray(option.fillers) && option.fillers.length > 0);
    if (hasAnyFillers) {
      const fillerLines = limited.map(option => {
        const fillers = Array.isArray(option.fillers) ? option.fillers : [];
        const value = fillers.length > 0
          ? fillers.map(entry => sanitizeDisplayText(formatParticipantDisplay(entry), { maxLength: 64, fallback: 'Usuario' })).join(', ')
          : '-';
        return `${sanitizeDisplayText(option.label, { maxLength: 60, fallback: 'Horario' })} -> ${value}`;
      });

      embed.addFields({
        name: '🧩 Fillers',
        value: safeEmbedFieldValue(fillerLines.join('\n')),
        inline: false
      });
    }
  }

  return embed;
}

function buildPveJoinRows(event, view = {}) {
  const options = Array.isArray(view.options) ? view.options : [];
  const rows = [];
  let row = new ActionRowBuilder();

  options.slice(0, 20).forEach((option, index) => {
    if (index > 0 && index % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`pve_join_${option.id}`)
        .setLabel(sanitizeDisplayText(option.label, { maxLength: 80, fallback: 'Horario' }))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(event.isClosed)
    );
  });

  if (row.components.length > 0) rows.push(row);
  return rows;
}

function buildManagementRow(event) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pve_leave')
      .setLabel('Salir')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(event.isClosed),
    new ButtonBuilder()
      .setCustomId('war_close')
      .setLabel(event.isClosed ? 'Abrir Inscripciones' : 'Cerrar Inscripciones')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('war_delete')
      .setLabel('Apagar')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('war_list')
      .setLabel('Ver Lista')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildPveMessagePayload(event, view = {}) {
  return {
    embeds: [buildPveEmbed(event, view)],
    components: [...buildPveJoinRows(event, view), buildManagementRow(event)]
  };
}

function buildPveReadOnlyPayload(event, view = {}) {
  return {
    embeds: [buildPveEmbed(event, view)],
    components: []
  };
}

function buildPveListText(event, view = {}) {
  const options = Array.isArray(view.options) ? view.options : [];
  const formatParticipantDisplay = createParticipantDisplayFormatter({
    guildId: event.guildId,
    classIconSource: event.classIconSource,
    participantDisplayStyle: event.participantDisplayStyle
  });
  const sections = options.map(option => {
    const users = option.enrollments?.length
      ? option.enrollments.map(entry => `${PARTICIPANT_PREFIX}${formatParticipantDisplay(entry)}`).join('\n')
      : '(sin inscritos)';
    const fillers = option.fillers?.length
      ? option.fillers.map(entry => `${PARTICIPANT_PREFIX}${formatParticipantDisplay(entry)}`).join('\n')
      : '';

    return `**⏰ ${option.label} (${option.enrollments.length}/${option.capacity})**\n${users}${fillers ? `\nF: ${fillers}` : ''}`;
  });

  return [
    `**${sanitizeDisplayText(event.name, { maxLength: 90, fallback: 'Evento PvE' })}**`,
    '',
    safeMessageContent(sections.length ? sections.join('\n\n') : 'Sin horarios configurados', 'Sin horarios configurados')
  ].join('\n');
}

module.exports = {
  buildPveMessagePayload,
  buildPveReadOnlyPayload,
  buildPveListText
};
