// Interfaz del acceso PvE (Abierto / Por roles / Por personas), compartida por la creacion del
// borrador y el panel `/event edit`: embed que explica el modo y selectores del modo activo.
const {
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder
} = require('discord.js');
const { MAX_ACCESS_ENTRIES, normalizeIds, describePveAccess, getMemberRoleIds } = require('../services/pveAccessRules');
const { safeEmbedTitle, safeEmbedDescription, safeEmbedFieldValue } = require('./textSafety');

const MODE_OPTIONS = [
  { value: 'OPEN', label: 'Abierto', description: 'Cualquiera que marque un horario queda como titular.' },
  { value: 'ROLES', label: 'Por roles', description: 'Titulares: quienes tengan alguno de los roles. El resto queda como filler.' },
  { value: 'USERS', label: 'Por personas', description: 'Titulares: solo las personas elegidas (se mencionan). El resto, filler.' }
];

function buildPveAccessEmbed(event, { title, notice = '' } = {}) {
  const access = describePveAccess(event);
  const embed = new EmbedBuilder()
    .setTitle(safeEmbedTitle(title || `🔐 Acceso PvE: ${event?.name || 'Evento'}`, '🔐 Acceso PvE'))
    .setDescription(safeEmbedDescription(`Modo: **${access.title}**\n${access.help}`))
    .setColor(0x2ecc71);

  if (access.mode === 'ROLES') {
    embed.addFields({ name: 'Roles con acceso (se mencionan al publicar)', value: safeEmbedFieldValue(access.targets), inline: false });
  } else if (access.mode === 'USERS') {
    embed.addFields(
      { name: 'Personas con acceso (se mencionan al publicar)', value: safeEmbedFieldValue(access.targets), inline: false },
      { name: 'Quienes se pueden elegir', value: 'Solo personas que pueden ver este canal: las demas se descartan al guardar.', inline: false }
    );
  }
  if (notice) embed.addFields({ name: 'Info', value: safeEmbedFieldValue(notice), inline: false });
  return embed;
}

// customIds: { mode, roles, users }. Devuelve la fila del modo y, si aplica, la del selector.
function buildPveAccessRows(event, customIds) {
  const access = describePveAccess(event);
  const rows = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customIds.mode)
        .setPlaceholder('Quien puede inscribirse como titular')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(MODE_OPTIONS.map(option => ({ ...option, default: option.value === access.mode })))
    )
  ];

  if (access.mode === 'ROLES') {
    const picker = new RoleSelectMenuBuilder()
      .setCustomId(customIds.roles)
      .setPlaceholder('Elige los roles con acceso')
      .setMinValues(0)
      .setMaxValues(MAX_ACCESS_ENTRIES);
    const current = normalizeIds(event?.allowedRoleIds).slice(0, MAX_ACCESS_ENTRIES);
    if (current.length) picker.setDefaultRoles(current);
    rows.push(new ActionRowBuilder().addComponents(picker));
  } else if (access.mode === 'USERS') {
    const picker = new UserSelectMenuBuilder()
      .setCustomId(customIds.users)
      .setPlaceholder('Elige las personas con acceso')
      .setMinValues(0)
      .setMaxValues(MAX_ACCESS_ENTRIES);
    const current = normalizeIds(event?.allowedUserIds).slice(0, MAX_ACCESS_ENTRIES);
    if (current.length) picker.setDefaultUsers(current);
    rows.push(new ActionRowBuilder().addComponents(picker));
  }
  return rows;
}

function buildPveAccessView(event, { customIds, title, notice } = {}) {
  return { embed: buildPveAccessEmbed(event, { title, notice }), rows: buildPveAccessRows(event, customIds) };
}

// El bot no tiene el intent GuildMembers: su cache de miembros no se actualiza sola, asi que los roles
// se piden siempre a Discord.
async function fetchFreshMember(guild, userId) {
  if (!guild?.members?.fetch) return null;
  return await guild.members.fetch({ user: String(userId), force: true }).catch(() => null);
}

// @everyone es un rol con el id del servidor: no sirve como restriccion ni se debe mencionar.
function selectableRoleIds(guildId, values) {
  return normalizeIds(values).filter(roleId => roleId !== String(guildId));
}

// Separa a las personas elegidas que pueden ver el canal del evento de las que no (bots y quien no
// esta en el servidor incluidos). Si el canal no se puede leer, no se descarta a nadie por permisos.
async function splitUsersByChannelAccess({ guild, channelId, userIds }) {
  const channel = channelId && guild?.channels?.fetch
    ? await guild.channels.fetch(String(channelId)).catch(() => null)
    : null;
  const allowed = [];
  const rejected = [];
  for (const userId of normalizeIds(userIds)) {
    const member = await fetchFreshMember(guild, userId);
    if (!member || member.user?.bot) {
      rejected.push(userId);
      continue;
    }
    const permissions = channel?.permissionsFor ? channel.permissionsFor(member) : null;
    if (permissions && !permissions.has(PermissionFlagsBits.ViewChannel)) {
      rejected.push(userId);
      continue;
    }
    allowed.push(userId);
  }
  return { allowed, rejected };
}

function buildRejectedUsersNotice(rejected) {
  return rejected.length
    ? `No se agregaron (no ven este canal, son bots o no estan en el servidor): ${rejected.map(userId => `<@${userId}>`).join(' ')}`
    : '';
}

// Para reevaluar fillers en modo por roles: roles actuales de un miembro ([] si no se puede leer).
function createMemberRoleResolver(guild) {
  return async userId => getMemberRoleIds(await fetchFreshMember(guild, userId));
}

module.exports = {
  buildPveAccessEmbed,
  buildPveAccessRows,
  buildPveAccessView,
  selectableRoleIds,
  splitUsersByChannelAccess,
  buildRejectedUsersNotice,
  createMemberRoleResolver
};
