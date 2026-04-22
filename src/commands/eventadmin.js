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
  removeFromWaitlist
} = require('../utils/warState');
const { notifyPromotion } = require('../utils/promotionNotifier');
const { parseEmojiInput } = require('../utils/emojiHelper');
const {
  resolveTargetWar,
  refreshWarMessage,
  promoteFromWaitlist,
  isAdminExecutor
} = require('./eventadminShared');

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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_add')
        .setDescription('Agrega un rol al evento publicado')
        .addStringOption(option =>
          option.setName('nombre').setDescription('Nombre del rol del evento').setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('slots').setDescription('Cantidad de slots').setRequired(true).setMinValue(1).setMaxValue(999)
        )
        .addStringOption(option =>
          option.setName('icono').setDescription('Emoji unicode o <:nombre:id>').setRequired(false)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_rename')
        .setDescription('Renombra un rol del evento publicado')
        .addStringOption(option =>
          option.setName('rol').setDescription('Rol actual').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('nuevo').setDescription('Nuevo nombre').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_remove')
        .setDescription('Elimina un rol del evento publicado')
        .addStringOption(option =>
          option.setName('rol').setDescription('Rol del evento').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_slots')
        .setDescription('Actualiza slots de un rol del evento publicado')
        .addStringOption(option =>
          option.setName('rol').setDescription('Rol del evento').setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option.setName('slots').setDescription('Nueva cantidad de slots').setRequired(true).setMinValue(1).setMaxValue(999)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_icon')
        .setDescription('Actualiza icono de un rol del evento publicado')
        .addStringOption(option =>
          option.setName('rol').setDescription('Rol del evento').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('icono').setDescription('Emoji unicode o <:nombre:id>').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_icon_clear')
        .setDescription('Quita icono de un rol del evento publicado')
        .addStringOption(option =>
          option.setName('rol').setDescription('Rol del evento').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_perm_add')
        .setDescription('Agrega permiso de rol Discord a un rol del evento')
        .addStringOption(option =>
          option.setName('rol').setDescription('Rol del evento').setRequired(true).setAutocomplete(true)
        )
        .addRoleOption(option =>
          option.setName('permiso').setDescription('Rol Discord permitido').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_perm_remove')
        .setDescription('Quita permiso de rol Discord de un rol del evento')
        .addStringOption(option =>
          option.setName('rol').setDescription('Rol del evento').setRequired(true).setAutocomplete(true)
        )
        .addRoleOption(option =>
          option.setName('permiso').setDescription('Rol Discord permitido').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role_perm_clear')
        .setDescription('Quita todos los permisos de un rol del evento')
        .addStringOption(option =>
          option.setName('rol').setDescription('Rol del evento').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('recap')
        .setDescription('Edita configuracion del hilo final del evento')
        .addIntegerOption(option =>
          option.setName('minutos').setDescription('Minutos antes de borrar (0 desactiva)').setRequired(true).setMinValue(0).setMaxValue(1440)
        )
        .addStringOption(option =>
          option.setName('texto').setDescription('Texto del aviso en el hilo').setRequired(false)
        )
        .addStringOption(option =>
          option.setName('id').setDescription('ID del evento').setRequired(false).setAutocomplete(true)
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

      if (subcommand === 'role_add') return await handleRoleAdd(interaction);
      if (subcommand === 'role_rename') return await handleRoleRename(interaction);
      if (subcommand === 'role_remove') return await handleRoleRemove(interaction);
      if (subcommand === 'role_slots') return await handleRoleSlots(interaction);
      if (subcommand === 'role_icon') return await handleRoleIcon(interaction);
      if (subcommand === 'role_icon_clear') return await handleRoleIconClear(interaction);
      if (subcommand === 'role_perm_add') return await handleRolePermAdd(interaction);
      if (subcommand === 'role_perm_remove') return await handleRolePermRemove(interaction);
      if (subcommand === 'role_perm_clear') return await handleRolePermClear(interaction);
      if (subcommand === 'recap') return await handleRecapConfig(interaction);
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

  const roleAutocompleteCommands = new Set([
    'add',
    'remove',
    'role_remove',
    'role_rename',
    'role_slots',
    'role_icon',
    'role_icon_clear',
    'role_perm_add',
    'role_perm_remove',
    'role_perm_clear'
  ]);

  if (roleAutocompleteCommands.has(subcommand) && focusedOption?.name === 'rol') {
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

  const { war: updatedWar, result } = await updateWarByMessageId(war.messageId, state => {
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

  const { war: updatedWar, result } = await updateWarByMessageId(war.messageId, state => {
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

async function handleRoleAdd(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('nombre', true).trim();
  const slots = interaction.options.getInteger('slots', true);
  const iconRaw = interaction.options.getString('icono')?.trim() || '';

  if (war.roles.some(role => role.name.toLowerCase() === roleName.toLowerCase())) {
    return await interaction.editReply({ content: `Ya existe un rol llamado **${roleName}**.` });
  }

  const parsedIcon = iconRaw ? parseEmojiInput(iconRaw, interaction.guild) : null;
  if (iconRaw && !parsedIcon) {
    return await interaction.editReply({ content: 'Icono invalido. Usa emoji unicode o formato <:nombre:id>.' });
  }

  war.roles.push({
    name: roleName,
    max: slots,
    emoji: parsedIcon?.emoji || null,
    emojiSource: parsedIcon?.emojiSource || null,
    users: [],
    allowedRoleIds: [],
    allowedRoles: []
  });

  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Rol agregado: **${roleName}** (${slots})` });
}

async function handleRoleRename(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('rol', true).trim();
  const newName = interaction.options.getString('nuevo', true).trim();
  const role = war.roles.find(entry => entry.name === roleName);
  if (!role) return await interaction.editReply({ content: `No existe el rol **${roleName}**.` });
  if (war.roles.some(entry => entry.name.toLowerCase() === newName.toLowerCase() && entry !== role)) {
    return await interaction.editReply({ content: `Ya existe otro rol llamado **${newName}**.` });
  }

  const previousName = role.name;
  role.name = newName;
  war.waitlist = war.waitlist.map(entry => (
    entry.roleName === previousName ? { ...entry, roleName: newName } : entry
  ));

  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Rol renombrado: **${previousName}** -> **${newName}**` });
}

async function handleRoleRemove(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('rol', true).trim();
  const roleIndex = war.roles.findIndex(role => role.name === roleName);
  if (roleIndex < 0) return await interaction.editReply({ content: `No existe el rol **${roleName}**.` });

  const [removed] = war.roles.splice(roleIndex, 1);
  war.waitlist = war.waitlist.filter(entry => entry.roleName !== removed.name);

  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Rol eliminado: **${removed.name}**` });
}

async function handleRoleSlots(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('rol', true).trim();
  const slots = interaction.options.getInteger('slots', true);
  const role = war.roles.find(entry => entry.name === roleName);
  if (!role) return await interaction.editReply({ content: `No existe el rol **${roleName}**.` });
  if (role.users.length > slots) {
    return await interaction.editReply({ content: `No puedes bajar a ${slots}; hay ${role.users.length} inscritos.` });
  }

  role.max = slots;
  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Slots actualizados para **${roleName}**: ${slots}` });
}

async function handleRoleIcon(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('rol', true).trim();
  const iconRaw = interaction.options.getString('icono', true).trim();
  const role = war.roles.find(entry => entry.name === roleName);
  if (!role) return await interaction.editReply({ content: `No existe el rol **${roleName}**.` });

  const parsed = parseEmojiInput(iconRaw, interaction.guild);
  if (!parsed) return await interaction.editReply({ content: 'Icono invalido. Usa emoji unicode o <:nombre:id>.' });

  role.emoji = parsed.emoji;
  role.emojiSource = parsed.emojiSource;

  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Icono actualizado para **${roleName}**: ${parsed.emoji}` });
}

async function handleRoleIconClear(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('rol', true).trim();
  const role = war.roles.find(entry => entry.name === roleName);
  if (!role) return await interaction.editReply({ content: `No existe el rol **${roleName}**.` });

  role.emoji = null;
  role.emojiSource = null;
  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Icono removido para **${roleName}**` });
}

async function handleRolePermAdd(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('rol', true).trim();
  const allowedRole = interaction.options.getRole('permiso', true);
  const role = war.roles.find(entry => entry.name === roleName);
  if (!role) return await interaction.editReply({ content: `No existe el rol **${roleName}**.` });

  if (!Array.isArray(role.allowedRoleIds)) role.allowedRoleIds = [];
  if (!Array.isArray(role.allowedRoles)) role.allowedRoles = [];
  if (!role.allowedRoleIds.includes(allowedRole.id)) role.allowedRoleIds.push(allowedRole.id);
  if (!role.allowedRoles.includes(allowedRole.name)) role.allowedRoles.push(allowedRole.name);

  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Permiso agregado en **${roleName}**: <@&${allowedRole.id}>` });
}

async function handleRolePermRemove(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('rol', true).trim();
  const allowedRole = interaction.options.getRole('permiso', true);
  const role = war.roles.find(entry => entry.name === roleName);
  if (!role) return await interaction.editReply({ content: `No existe el rol **${roleName}**.` });

  role.allowedRoleIds = (role.allowedRoleIds || []).filter(id => id !== allowedRole.id);
  role.allowedRoles = (role.allowedRoles || []).filter(name => name !== allowedRole.name);

  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Permiso removido en **${roleName}**: <@&${allowedRole.id}>` });
}

async function handleRolePermClear(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const roleName = interaction.options.getString('rol', true).trim();
  const role = war.roles.find(entry => entry.name === roleName);
  if (!role) return await interaction.editReply({ content: `No existe el rol **${roleName}**.` });

  role.allowedRoleIds = [];
  role.allowedRoles = [];
  const updatedWar = await updateWar(war);
  await refreshWarMessage(interaction, updatedWar);
  await interaction.editReply({ content: `Permisos limpiados para **${roleName}**` });
}

async function handleRecapConfig(interaction) {
  await interaction.deferReply({ flags: 64 });
  const war = await resolveTargetWar(interaction, interaction.options.getString('id'));
  if (!war) return await interaction.editReply({ content: 'No se encontro evento activo. Usa la opcion `id`.' });

  const minutes = interaction.options.getInteger('minutos', true);
  const text = interaction.options.getString('texto')?.trim() || '';
  if (!war.recap) war.recap = {};
  war.recap.enabled = minutes > 0 || text.length > 0;
  war.recap.minutesBeforeExpire = minutes;
  war.recap.messageText = text;

  const updatedWar = await updateWar(war);
  await interaction.editReply({
    content: `Hilo final ${updatedWar.recap.enabled ? 'configurado' : 'desactivado'}: ${minutes} min antes de borrar.`
  });
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
  const updatedWar = await updateWar(war);
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
