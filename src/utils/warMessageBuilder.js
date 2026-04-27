const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getWarTotals } = require('./warState');
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

// Constructor de payload visual del evento:
// - Embed principal (roles, waitlist, metadata)
// - Botones de inscripcion y administracion
const ICONS = {
  skull: '\uD83D\uDC80',
  calendar: '\uD83D\uDCC5',
  note: '\uD83D\uDCDD',
  waitlist: '\uD83D\uDCCB',
  lock: '\uD83D\uDD12',
  whiteCircle: '\u26AA'
};
const PARTICIPANT_PREFIX = '▏ ';

function buildWarEmbed(war) {
  const { totalSlots, totalSigned } = getWarTotals(war);
  const formatParticipantDisplay = createParticipantDisplayFormatter({
    guildId: war.guildId,
    classIconSource: war.classIconSource,
    participantDisplayStyle: war.participantDisplayStyle
  });
  const startsAt = Math.floor((war.createdAt || Date.now()) / 1000);
  const endsAt = Math.floor((war.expiresAt || war.closesAt || Date.now()) / 1000);
  const closesAt = `<t:${Math.floor(war.closesAt / 1000)}:R>`;
  const eventMeta = getEventTypeMeta(war.eventType);
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const recurrenceLabel = Number.isInteger(war.dayOfWeek) ? dayNames[war.dayOfWeek] : null;

  const safeName = sanitizeDisplayText(war.name, { maxLength: 90, fallback: 'Evento' });
  const safeType = sanitizeDisplayText(war.type, { maxLength: 120, fallback: 'Por definir' });
  const description = [
    `${ICONS.calendar} **Horario**`,
    `<t:${startsAt}:F> - <t:${endsAt}:t>`,
    `<t:${startsAt}:R>`,
    safeType,
    '',
    `${ICONS.note} **Inscripciones**`,
    war.isClosed ? 'Cerradas' : 'Abiertas',
    war.isClosed ? '' : `Cierran ${closesAt}`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle(safeEmbedTitle(`${ICONS.skull} ${safeName} (${eventMeta.label}) ${totalSlots} players`, `${ICONS.skull} Evento`))
    .setDescription(safeEmbedDescription(description))
    .setColor(0x9333ea);

  const roleFields = war.roles.map(role => {
    const restrictionsText = formatRoleRestrictions(role);
    const membersText = formatRoleMembers(role, formatParticipantDisplay);

    return {
      name: safeEmbedFieldName(`${role.emoji || ICONS.whiteCircle} ${sanitizeDisplayText(role.name, { maxLength: 60, fallback: 'Rol' })} (${role.users.length}/${role.max})`),
      value: safeEmbedFieldValue(restrictionsText ? `${restrictionsText}\n${membersText}` : membersText),
      inline: true
    };
  });

  if (roleFields.length) {
    embed.addFields(...roleFields);
  } else {
    embed.addFields({ name: 'Roles', value: safeEmbedFieldValue('Sin roles configurados'), inline: false });
  }

  const waitlistText = war.waitlist.length
    ? war.waitlist
      .map((entry, index) => {
        const role = war.roles.find(r => r.name === entry.roleName);
        const roleLabel = role
          ? ` (${role.emoji || ICONS.whiteCircle} ${sanitizeDisplayText(role.name, { maxLength: 60, fallback: 'Rol' })})`
          : '';
        return `${index + 1}. ${sanitizeDisplayText(entry.userName, { maxLength: 64, fallback: 'Usuario' })}${roleLabel}`;
      })
      .join('\n')
    : '-';

  embed.addFields({
    name: safeEmbedFieldName(`${ICONS.waitlist} Waitlist (${war.waitlist.length})`, 'Waitlist'),
    value: safeEmbedFieldValue(waitlistText),
    inline: false
  });

  const createdBy = war.creatorId ? `<@${war.creatorId}>` : 'Desconocido';
  const createdAt = `<t:${Math.floor(war.createdAt / 1000)}:R>`;

  embed.addFields({
    name: 'Registro',
    value: safeEmbedFieldValue(`**${totalSigned}/${totalSlots}** jugadores inscritos\nCreado por ${createdBy} | ${createdAt}${recurrenceLabel ? `\nRepite: ${recurrenceLabel}` : ''}`),
    inline: false
  });

  return embed;
}

function buildRoleRows(war) {
  // Crea filas de botones (max 5 por fila) usando emoji del rol como icono principal.
  const rows = [];
  let row = new ActionRowBuilder();

  war.roles.forEach((role, index) => {
    if (index > 0 && index % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    const emoji = toButtonEmoji(role.emoji || ICONS.whiteCircle, role.emojiSource) || ICONS.whiteCircle;
    const button = new ButtonBuilder()
      .setCustomId(`join_${index}`)
      .setDisabled(war.isClosed)
      .setStyle(ButtonStyle.Secondary);

    button.setEmoji(emoji);

    row.addComponents(button);
  });

  if (row.components.length) rows.push(row);

  return rows;
}

function toButtonEmoji(emojiText, emojiSource) {
  // Convierte emoji persistido (unicode o custom <a:name:id>) al formato esperado por Discord.
  if (!emojiText) return null;
  const customMatch = String(emojiText).match(/^<(a?):([A-Za-z0-9_]+):(\d+)>$/);

  if (emojiSource === 'unicode' || (!emojiSource && !customMatch)) {
    return String(emojiText);
  }

  if (customMatch) {
    return {
      animated: customMatch[1] === 'a',
      name: customMatch[2],
      id: customMatch[3]
    };
  }

  return String(emojiText);
}

function formatRoleRestrictions(role) {
  const allowedIds = Array.isArray(role.allowedRoleIds) ? role.allowedRoleIds.filter(Boolean) : [];
  if (allowedIds.length > 0) {
    return `${ICONS.lock} ${allowedIds.map(roleId => `<@&${roleId}>`).join(' ')}`;
  }

  const allowedNames = Array.isArray(role.allowedRoles) ? role.allowedRoles.filter(Boolean) : [];
  if (allowedNames.length > 0) {
    return `${ICONS.lock} ${allowedNames.map(name => sanitizeDisplayText(`@${name}`, { maxLength: 50, fallback: '@rol' })).join(' ')}`;
  }

  return null;
}

function buildManagementRow(war) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('war_close')
      .setLabel(war.isClosed ? 'Abrir Inscripciones' : 'Cerrar Inscripciones')
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

function buildWarMessagePayload(war) {
  const rows = [...buildRoleRows(war), buildManagementRow(war)];

  return {
    embeds: [buildWarEmbed(war)],
    components: rows
  };
}

function buildWarReadOnlyPayload(war) {
  const rows = [];
  let row = new ActionRowBuilder();

  war.roles.forEach((role, index) => {
    if (index > 0 && index % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    const emoji = toButtonEmoji(role.emoji || ICONS.whiteCircle, role.emojiSource) || ICONS.whiteCircle;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`readonly_${index}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
        .setEmoji(emoji)
    );
  });

  if (row.components.length) rows.push(row);

  return {
    embeds: [buildWarEmbed(war)],
    components: rows
  };
}

function buildWarListText(war) {
  const formatParticipantDisplay = createParticipantDisplayFormatter({
    guildId: war.guildId,
    classIconSource: war.classIconSource,
    participantDisplayStyle: war.participantDisplayStyle
  });
  const roleText = war.roles
    .map(role => {
      const users = role.users.length
        ? role.users.map(user => `${PARTICIPANT_PREFIX}${formatParticipantDisplay(user)}`).join('\n')
        : '-';

      return `**${role.emoji || ICONS.whiteCircle} ${role.name} (${role.users.length}/${role.max})**\n${users}`;
    })
    .join('\n\n');

  const waitlistText = war.waitlist.length
    ? war.waitlist.map((entry, index) => `${index + 1}. ${sanitizeDisplayText(entry.userName, { maxLength: 64, fallback: 'Usuario' })}${entry.roleName ? ` (${sanitizeDisplayText(entry.roleName, { maxLength: 60, fallback: 'Rol' })})` : ''}`).join('\n')
    : '(sin usuarios en espera)';

  return [
    `**${sanitizeDisplayText(war.name, { maxLength: 90, fallback: 'Evento' })}**`,
    '',
    safeMessageContent(roleText || 'Sin roles', 'Sin roles'),
    '',
    `**Waitlist (${war.waitlist.length})**`,
    safeMessageContent(waitlistText, '(sin usuarios en espera)')
  ].join('\n');
}
function formatRoleMembers(role, formatParticipantDisplay) {
  if (!role.users.length) return '-';
  return role.users.map(user => `${PARTICIPANT_PREFIX}${formatParticipantDisplay(user)}`).join('\n');
}

module.exports = {
  buildWarMessagePayload,
  buildWarReadOnlyPayload,
  buildWarListText
};
