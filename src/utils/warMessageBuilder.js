const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatMemberList, getWarTotals } = require('./warState');
const { getEventTypeMeta } = require('../constants/eventTypes');

const ICONS = {
  skull: '\uD83D\uDC80',
  calendar: '\uD83D\uDCC5',
  note: '\uD83D\uDCDD',
  waitlist: '\uD83D\uDCCB',
  lock: '\uD83D\uDD12',
  whiteCircle: '\u26AA'
};

function buildWarEmbed(war) {
  const { totalSlots, totalSigned } = getWarTotals(war);
  const startsAt = Math.floor((war.createdAt || Date.now()) / 1000);
  const endsAt = Math.floor((war.closesAt || Date.now()) / 1000);
  const closesAt = `<t:${Math.floor(war.closesAt / 1000)}:R>`;
  const eventMeta = getEventTypeMeta(war.eventType);
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const recurrenceLabel = Number.isInteger(war.dayOfWeek) ? dayNames[war.dayOfWeek] : null;

  const description = [
    `${ICONS.calendar} **Horario**`,
    `<t:${startsAt}:F> - <t:${endsAt}:t>`,
    `<t:${startsAt}:R>`,
    war.type || 'Por definir',
    '',
    `${ICONS.note} **Inscripciones**`,
    war.isClosed ? 'Cerradas' : 'Abiertas',
    war.isClosed ? '' : `Cierran ${closesAt}`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`${ICONS.skull} ${war.name} (${eventMeta.label}) ${totalSlots} players`)
    .setDescription(description)
    .setColor(0xf1c40f);

  const roleFields = war.roles.map(role => {
    const hasRestrictions =
      (Array.isArray(role.allowedRoleIds) && role.allowedRoleIds.length > 0) ||
      (Array.isArray(role.allowedRoles) && role.allowedRoles.length > 0);
    const lockIcon = hasRestrictions ? ` ${ICONS.lock}` : '';

    return {
      name: `${role.emoji || ICONS.whiteCircle} ${role.name} (${role.users.length}/${role.max})${lockIcon}`,
      value: formatMemberList(role),
      inline: true
    };
  });

  if (roleFields.length) {
    embed.addFields(...roleFields);
  } else {
    embed.addFields({ name: 'Roles', value: 'Sin roles configurados', inline: false });
  }

  const waitlistText = war.waitlist.length
    ? war.waitlist
      .map((entry, index) => {
        const role = war.roles.find(r => r.name === entry.roleName);
        const roleLabel = role ? ` (${role.emoji || ICONS.whiteCircle} ${role.name})` : '';
        return `${index + 1}. ${entry.userName}${roleLabel}`;
      })
      .join('\n')
    : '-- vacio --';

  embed.addFields({
    name: `${ICONS.waitlist} Waitlist (${war.waitlist.length})`,
    value: waitlistText,
    inline: false
  });

  const createdBy = war.creatorId ? `<@${war.creatorId}>` : 'Desconocido';
  const createdAt = `<t:${Math.floor(war.createdAt / 1000)}:R>`;

  embed.addFields({
    name: 'Registro',
    value: `**${totalSigned}/${totalSlots}** jugadores inscritos\nCreado por ${createdBy} | ${createdAt}${recurrenceLabel ? `\nRepite: ${recurrenceLabel}` : ''}`,
    inline: false
  });

  return embed;
}

function buildRoleRows(war) {
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
  if (!emojiText) return null;

  if (!emojiSource) {
    const isCustom = /^<a?:[A-Za-z0-9_]+:\d+>$/.test(String(emojiText));
    if (isCustom) return null;
    return String(emojiText);
  }

  if (emojiSource === 'unicode') {
    return String(emojiText);
  }

  if (emojiSource === 'custom') {
    return ICONS.whiteCircle;
  }

  const customMatch = String(emojiText).match(/^<(a?):([A-Za-z0-9_]+):(\d+)>$/);
  if (customMatch) {
    return {
      animated: customMatch[1] === 'a',
      name: customMatch[2],
      id: customMatch[3]
    };
  }

  return String(emojiText);
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

function buildWarListText(war) {
  const roleText = war.roles
    .map(role => {
      const users = role.users.length
        ? role.users.map(user => `- ${user.displayName}`).join('\n')
        : '- (vacio)';

      return `**${role.emoji || ICONS.whiteCircle} ${role.name} (${role.users.length}/${role.max})**\n${users}`;
    })
    .join('\n\n');

  const waitlistText = war.waitlist.length
    ? war.waitlist.map((entry, index) => `${index + 1}. ${entry.userName}${entry.roleName ? ` (${entry.roleName})` : ''}`).join('\n')
    : '(sin usuarios en espera)';

  return [
    `**${war.name}**`,
    '',
    roleText || 'Sin roles',
    '',
    `**Waitlist (${war.waitlist.length})**`,
    waitlistText
  ].join('\n');
}

module.exports = {
  buildWarMessagePayload,
  buildWarListText
};
