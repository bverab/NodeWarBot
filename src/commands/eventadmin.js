const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  loadWars,
  updateWarByMessageId,
  updateWar
} = require('../services/warService');
const {
  getRoleByName,
  findParticipantRole,
  removeParticipantFromAllRoles,
  addParticipantToRole,
  upsertWaitlistEntry,
  removeFromWaitlist,
  pickWaitlistForRole
} = require('../utils/warState');
const { buildWarMessagePayload } = require('../utils/warMessageBuilder');

// Comando administrativo para eventos publicados:
// - add/remove miembros reales
// - lock/unlock global de inscripciones por ID
module.exports = {
  data: new SlashCommandBuilder()
    .setName('eventadmin')
    .setDescription('Herramientas admin para gestionar un evento publicado')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Agrega un miembro real a un rol del evento activo')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Miembro a agregar')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID de evento (opcional, por defecto usa el activo del canal)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Saca un miembro real de un rol del evento activo')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Miembro a remover')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID de evento (opcional, por defecto usa el activo del canal)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('lock')
        .setDescription('Bloquea todas las inscripciones de un evento por ID')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unlock')
        .setDescription('Desbloquea todas las inscripciones de un evento por ID')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        return await handleAutocomplete(interaction);
      }

      if (!isAdminExecutor(interaction)) {
        return await interaction.reply({ content: 'Solo Admin puede usar este comando.', flags: 64 });
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'add') {
        return await handleAddMember(interaction);
      }

      if (subcommand === 'remove') {
        return await handleRemoveMember(interaction);
      }

      if (subcommand === 'lock') {
        return await handleToggleLock(interaction, true);
      }

      if (subcommand === 'unlock') {
        return await handleToggleLock(interaction, false);
      }
    } catch (error) {
      console.error('Error en eventadmin:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error ejecutando eventadmin', flags: 64 });
      }
    }
  }
};

async function handleAutocomplete(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const focusedOption = interaction.options.getFocused(true);

  if (focusedOption?.name === 'id') {
    const wars = loadWars()
      .filter(war => war.channelId === interaction.channelId && war.messageId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(war => ({
        name: `${war.name} | ${war.id}`.slice(0, 100),
        value: String(war.id)
      }))
      .filter(item => item.name.toLowerCase().includes(focusedValue) || item.value.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    return await interaction.respond(wars);
  }

  if ((subcommand === 'add' || subcommand === 'remove') && focusedOption?.name === 'rol') {
    const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
    if (!war || !war.roles.length) {
      return await interaction.respond([]);
    }

    const roles = war.roles
      .map(role => ({
        name: `${role.emoji || 'o'} ${role.name}`.slice(0, 100),
        value: role.name
      }))
      .filter(item => item.name.toLowerCase().includes(focusedValue) || item.value.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    return await interaction.respond(roles);
  }

  return await interaction.respond([]);
}

async function handleAddMember(interaction) {
  // Agrega o mueve un miembro al rol del evento; si esta lleno, lo envía a waitlist.
  await interaction.deferReply({ flags: 64 });

  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) {
    return await interaction.editReply({
      content: 'No se encontro evento activo en este canal. Si hay varios, usa la opcion `id`.'
    });
  }

  if (!war.messageId) {
    return await interaction.editReply({ content: 'El evento aun no tiene mensaje publicado.' });
  }

  const user = interaction.options.getUser('usuario', true);
  const roleName = interaction.options.getString('rol', true).trim();
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    return await interaction.editReply({ content: 'Ese usuario no pertenece a este servidor.' });
  }

  const participant = {
    userId: user.id,
    displayName: member.displayName || user.username,
    isFake: false
  };

  const { war: updatedWar, result } = updateWarByMessageId(war.messageId, state => {
    const selectedRole = getRoleByName(state, roleName);
    if (!selectedRole) return { type: 'missing_role' };

    const isAlreadyInSelectedRole = selectedRole.users.some(entry => entry.userId === participant.userId);
    if (isAlreadyInSelectedRole) {
      return { type: 'already_in_role', roleName: selectedRole.name };
    }

    const currentRole = findParticipantRole(state, participant.userId);

    if (selectedRole.users.length >= selectedRole.max) {
      const promotedUsers = [];

      if (currentRole && currentRole.name !== selectedRole.name) {
        const previousRoleName = currentRole.name;
        removeParticipantFromAllRoles(state, participant.userId);

        const promoted = promoteFromWaitlist(state, previousRoleName);
        if (promoted) promotedUsers.push(promoted);
      }

      removeFromWaitlist(state, participant.userId);
      const added = upsertWaitlistEntry(state, {
        userId: participant.userId,
        userName: participant.displayName,
        roleName: selectedRole.name,
        joinedAt: Date.now(),
        isFake: false
      });

      return {
        type: added ? 'waitlist_added' : 'waitlist_exists',
        roleName: selectedRole.name,
        queueSize: state.waitlist.length,
        promotedUsers
      };
    }

    const promotedUsers = [];
    if (currentRole) {
      const previousRoleName = currentRole.name;
      removeParticipantFromAllRoles(state, participant.userId);

      if (previousRoleName !== selectedRole.name) {
        const promoted = promoteFromWaitlist(state, previousRoleName);
        if (promoted) promotedUsers.push(promoted);
      }
    }

    addParticipantToRole(selectedRole, participant);
    removeFromWaitlist(state, participant.userId);

    return {
      type: currentRole ? 'switched_role' : 'joined_role',
      roleName: selectedRole.name,
      promotedUsers
    };
  });

  if (!updatedWar || !result) {
    return await interaction.editReply({ content: 'No se pudo actualizar el evento.' });
  }

  const refreshed = await refreshWarMessage(interaction, updatedWar);
  if (!refreshed) {
    return await interaction.editReply({ content: 'Evento actualizado en datos, pero no encontre el mensaje activo.' });
  }

  const responseByType = {
    missing_role: `El rol **${roleName}** no existe`,
    already_in_role: `<@${user.id}> ya estaba en **${result.roleName}**`,
    waitlist_exists: `<@${user.id}> ya estaba en waitlist`,
    waitlist_added: `<@${user.id}> agregado a waitlist de **${result.roleName}** (#${result.queueSize})`,
    joined_role: `<@${user.id}> agregado a **${result.roleName}**`,
    switched_role: `<@${user.id}> movido a **${result.roleName}**`
  };

  await interaction.editReply({ content: responseByType[result.type] || 'Evento actualizado' });

  for (const promotedUser of result.promotedUsers || []) {
    await notifyPromotion(interaction, updatedWar, promotedUser);
  }
}

async function handleRemoveMember(interaction) {
  // Remueve miembro de un rol puntual y promueve waitlist si se libera un cupo.
  await interaction.deferReply({ flags: 64 });

  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) {
    return await interaction.editReply({
      content: 'No se encontro evento activo en este canal. Si hay varios, usa la opcion `id`.'
    });
  }

  if (!war.messageId) {
    return await interaction.editReply({ content: 'El evento aun no tiene mensaje publicado.' });
  }

  const user = interaction.options.getUser('usuario', true);
  const roleName = interaction.options.getString('rol', true).trim();

  const { war: updatedWar, result } = updateWarByMessageId(war.messageId, state => {
    const selectedRole = getRoleByName(state, roleName);
    if (!selectedRole) return { type: 'missing_role' };

    const beforeCount = selectedRole.users.length;
    selectedRole.users = selectedRole.users.filter(entry => entry.userId !== user.id);
    const removedFromRole = selectedRole.users.length < beforeCount;

    const waitlistBefore = state.waitlist.length;
    state.waitlist = state.waitlist.filter(entry => !(entry.userId === user.id && entry.roleName === roleName));
    const removedFromWaitlistForRole = state.waitlist.length < waitlistBefore;

    if (!removedFromRole && !removedFromWaitlistForRole) {
      return { type: 'not_in_role', roleName: selectedRole.name };
    }

    // Evita estados ambiguos: si el usuario estaba en waitlist para otro rol, lo limpiamos tambien.
    removeFromWaitlist(state, user.id);

    const promotedUsers = [];
    if (removedFromRole) {
      const promoted = promoteFromWaitlist(state, selectedRole.name);
      if (promoted) promotedUsers.push(promoted);
    }

    return {
      type: removedFromRole ? 'removed_from_role' : 'removed_from_waitlist',
      roleName: selectedRole.name,
      promotedUsers
    };
  });

  if (!updatedWar || !result) {
    return await interaction.editReply({ content: 'No se pudo actualizar el evento.' });
  }

  const refreshed = await refreshWarMessage(interaction, updatedWar);
  if (!refreshed) {
    return await interaction.editReply({ content: 'Evento actualizado en datos, pero no encontre el mensaje activo.' });
  }

  const responseByType = {
    missing_role: `El rol **${roleName}** no existe`,
    not_in_role: `<@${user.id}> no estaba en **${result.roleName}**`,
    removed_from_role: `<@${user.id}> removido de **${result.roleName}**`,
    removed_from_waitlist: `<@${user.id}> removido de waitlist de **${result.roleName}**`
  };

  await interaction.editReply({ content: responseByType[result.type] || 'Evento actualizado' });

  for (const promotedUser of result.promotedUsers || []) {
    await notifyPromotion(interaction, updatedWar, promotedUser);
  }
}

async function handleToggleLock(interaction, shouldLock) {
  await interaction.deferReply({ flags: 64 });

  const eventId = interaction.options.getString('id', true).trim();
  const war = await resolveTargetWar(interaction, eventId);
  if (!war) {
    return await interaction.editReply({ content: `No se encontro evento con id \`${eventId}\` en este canal.` });
  }

  if (!war.messageId) {
    return await interaction.editReply({ content: 'Ese evento no esta activo/publicado todavia.' });
  }

  if (war.isClosed === shouldLock) {
    return await interaction.editReply({
      content: shouldLock ? 'Ese evento ya estaba bloqueado.' : 'Ese evento ya estaba desbloqueado.'
    });
  }

  war.isClosed = shouldLock;
  const updatedWar = updateWar(war);
  const refreshed = await refreshWarMessage(interaction, updatedWar);

  if (!refreshed) {
    return await interaction.editReply({
      content: shouldLock
        ? 'Evento bloqueado en datos, pero no encontre el mensaje para refrescar.'
        : 'Evento desbloqueado en datos, pero no encontre el mensaje para refrescar.'
    });
  }

  await interaction.editReply({
    content: shouldLock
      ? `Inscripciones bloqueadas para **${updatedWar.name}** (\`${updatedWar.id}\`)`
      : `Inscripciones desbloqueadas para **${updatedWar.name}** (\`${updatedWar.id}\`)`
  });
}

async function resolveTargetWar(interaction, eventId) {
  if (eventId) {
    return loadWars().find(war => war.id === String(eventId).trim() && war.channelId === interaction.channelId) || null;
  }

  return await resolveActiveWar(interaction);
}

async function resolveActiveWar(interaction) {
  // Elige el evento mas reciente realmente visible en el canal, evitando fallback ambiguo.
  const wars = loadWars()
    .filter(war => war.channelId === interaction.channelId && war.messageId)
    .sort((a, b) => b.createdAt - a.createdAt);

  try {
    const recentMessages = await interaction.channel.messages.fetch({ limit: 100 });
    const orderMap = new Map();
    let pos = 0;
    for (const message of recentMessages.values()) {
      orderMap.set(message.id, pos);
      pos += 1;
    }

    const active = wars
      .filter(war => orderMap.has(war.messageId))
      .sort((a, b) => orderMap.get(a.messageId) - orderMap.get(b.messageId))[0];
    if (active) return active;
  } catch (error) {
    console.warn('No se pudieron leer mensajes recientes para resolver evento activo');
  }

  return null;
}

async function refreshWarMessage(interaction, war) {
  try {
    const channel = await interaction.guild.channels.fetch(war.channelId).catch(() => null);
    if (!channel || !channel.messages?.fetch) return false;

    const message = await channel.messages.fetch(war.messageId);
    await message.edit(buildWarMessagePayload(war));
    return true;
  } catch (error) {
    if (error?.code === 10008) return false;
    console.error('Error actualizando mensaje del evento:', error);
    return false;
  }
}

function promoteFromWaitlist(state, roleName) {
  const role = getRoleByName(state, roleName);
  if (!role || role.users.length >= role.max) return null;

  const nextInWaitlist = pickWaitlistForRole(state, role.name);
  if (!nextInWaitlist) return null;

  const promoted = {
    userId: nextInWaitlist.userId,
    displayName: nextInWaitlist.userName,
    isFake: nextInWaitlist.isFake
  };

  addParticipantToRole(role, promoted);
  return { ...promoted, roleName: role.name };
}

async function notifyPromotion(interaction, war, promotedUser) {
  if (!promotedUser || promotedUser.isFake) return;

  const roleName = promotedUser.roleName || 'el rol seleccionado';
  const eventUrl = interaction.guildId && war?.channelId && war?.messageId
    ? `https://discord.com/channels/${interaction.guildId}/${war.channelId}/${war.messageId}`
    : null;
  const eventTitle = war?.name || 'Evento';
  const text = eventUrl
    ? `Se libero un cupo para **${roleName}** en [${eventTitle}](${eventUrl}). Ya te movimos desde la waitlist.`
    : `Se libero un cupo para **${roleName}**. Ya te movimos desde la waitlist.`;
  const dmContent = `**Entraste!**\n${text}`;

  try {
    const user = await interaction.client.users.fetch(promotedUser.userId);
    await user.send(dmContent);
    return;
  } catch (error) {
    console.log(`DM no disponible para ${promotedUser.userId}, usando fallback en canal`);
  }

  try {
    await interaction.channel.send({
      content: `<@${promotedUser.userId}> ${dmContent}`,
      allowedMentions: { parse: ['users'] }
    });
  } catch (error) {
    console.log(`No se pudo enviar fallback en canal para ${promotedUser.userId}`);
  }
}

function isAdminExecutor(interaction) {
  const hasAdminPermission = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const adminRoleNames = new Set(['admin', 'administrador']);
  const hasAdminRole = Boolean(
    interaction.member?.roles?.cache?.some(role => adminRoleNames.has(String(role.name).toLowerCase().trim()))
  );

  return Boolean(hasAdminPermission || hasAdminRole);
}
