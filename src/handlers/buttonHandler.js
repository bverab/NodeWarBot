const {
  getWarByMessageId,
  updateWarByMessageId,
  deleteWarByMessageId
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
const { buildWarMessagePayload, buildWarListText } = require('../utils/warMessageBuilder');

module.exports = async interaction => {
  try {
    if (!interaction.isButton()) return;

    await interaction.deferUpdate();

    if (interaction.customId === 'war_close') {
      return await handleToggleClose(interaction);
    }

    if (interaction.customId === 'war_delete') {
      return await handleDeleteWar(interaction);
    }

    if (interaction.customId === 'war_list') {
      return await handleViewList(interaction);
    }

    if (interaction.customId.startsWith('join_')) {
      return await handleJoinRole(interaction);
    }
  } catch (error) {
    console.error('Error en buttonHandler:', error);

    try {
      await interaction.followUp({ content: 'Error interno', flags: 64 });
    } catch (replyError) {
      console.error('Error enviando follow-up:', replyError);
    }
  }
};

async function handleToggleClose(interaction) {
  const currentWar = getWarByMessageId(interaction.message.id);
  if (!currentWar) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  if (currentWar.creatorId !== interaction.user.id) {
    return await interaction.followUp({ content: 'Solo el creador puede gestionar el evento', flags: 64 });
  }

  const { war } = updateWarByMessageId(interaction.message.id, state => {
    state.isClosed = !state.isClosed;
  });

  if (!war) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  await interaction.message.edit(buildWarMessagePayload(war));
  await interaction.followUp({
    content: war.isClosed ? 'Inscripciones cerradas' : 'Inscripciones abiertas',
    flags: 64
  });
}

async function handleDeleteWar(interaction) {
  const war = getWarByMessageId(interaction.message.id);
  if (!war) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  if (war.creatorId !== interaction.user.id) {
    return await interaction.followUp({ content: 'Solo el creador puede eliminar el evento', flags: 64 });
  }

  deleteWarByMessageId(interaction.message.id);
  await interaction.message.delete().catch(() => null);
  await interaction.followUp({ content: 'Evento eliminado', flags: 64 });
}

async function handleViewList(interaction) {
  const war = getWarByMessageId(interaction.message.id);
  if (!war) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  await interaction.followUp({
    content: buildWarListText(war),
    flags: 64
  });
}

async function handleJoinRole(interaction) {
  const currentWar = getWarByMessageId(interaction.message.id);
  if (!currentWar) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  const roleIndex = Number(interaction.customId.replace('join_', ''));
  const role = Number.isInteger(roleIndex) ? currentWar.roles[roleIndex] : null;
  if (!role) {
    return await interaction.followUp({ content: 'El rol no existe', flags: 64 });
  }
  const roleName = role.name;

  const requiredRoleIds = Array.isArray(role.allowedRoleIds) ? role.allowedRoleIds : [];
  const requiredRoleNames = Array.isArray(role.allowedRoles) ? role.allowedRoles : [];

  if ((requiredRoleIds.length > 0 || requiredRoleNames.length > 0) && interaction.member) {
    const hasRequiredById =
      requiredRoleIds.length > 0 &&
      requiredRoleIds.some(roleId => interaction.member.roles.cache.has(roleId));

    const hasRequiredByName =
      requiredRoleNames.length > 0 &&
      requiredRoleNames.some(requiredRole =>
        interaction.member.roles.cache.some(memberRole => memberRole.name === requiredRole)
      );

    if (!hasRequiredById && !hasRequiredByName) {
      const roleListText =
        requiredRoleIds.length > 0
          ? requiredRoleIds.map(roleId => `<@&${roleId}>`).join(', ')
          : requiredRoleNames.join(', ');

      return await interaction.followUp({
        content: `No tienes permiso. Roles requeridos: ${roleListText}`,
        flags: 64
      });
    }
  }

  const participant = {
    userId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    isFake: false
  };

  const { war, result } = updateWarByMessageId(interaction.message.id, state => {
    const selectedRole = getRoleByName(state, roleName);
    if (!selectedRole) return { type: 'missing_role' };

    const isAlreadyInSelectedRole = selectedRole.users.some(user => user.userId === participant.userId);

    if (isAlreadyInSelectedRole) {
      selectedRole.users = selectedRole.users.filter(user => user.userId !== participant.userId);

      let promoted = null;
      if (selectedRole.users.length < selectedRole.max) {
        const nextInWaitlist = pickWaitlistForRole(state, selectedRole.name);
        if (nextInWaitlist) {
          promoted = {
            userId: nextInWaitlist.userId,
            displayName: nextInWaitlist.userName,
            isFake: nextInWaitlist.isFake
          };
          addParticipantToRole(selectedRole, promoted);
        }
      }

      return {
        type: 'left_role',
        roleName: selectedRole.name,
        promoted
      };
    }

    if (state.isClosed) {
      return { type: 'closed' };
    }

    const currentRole = findParticipantRole(state, participant.userId);

    if (selectedRole.users.length >= selectedRole.max) {
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
        queueSize: state.waitlist.length
      };
    }

    if (currentRole) {
      removeParticipantFromAllRoles(state, participant.userId);
    }

    addParticipantToRole(selectedRole, participant);
    removeFromWaitlist(state, participant.userId);

    return {
      type: currentRole ? 'switched_role' : 'joined_role',
      roleName: selectedRole.name
    };
  });

  if (!war || !result) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  await interaction.message.edit(buildWarMessagePayload(war));

  const responseByType = {
    missing_role: 'El rol no existe',
    closed: 'Las inscripciones estan cerradas',
    waitlist_exists: 'Ya estas en la lista de espera',
    waitlist_added: `Rol lleno. Te agregue a la waitlist (#${result.queueSize})`,
    joined_role: `Te uniste a **${result.roleName}**`,
    switched_role: `Cambiaste a **${result.roleName}**`,
    left_role: `Te retiraste de **${result.roleName}**`
  };

  await interaction.followUp({
    content: responseByType[result.type] || 'Evento actualizado',
    flags: 64
  });

  if (result.promoted && !result.promoted.isFake) {
    try {
      const user = await interaction.client.users.fetch(result.promoted.userId);
      await user.send(`Se libero un cupo y ahora estas inscrito en **${result.roleName}**`);
    } catch (error) {
      console.log('No se pudo notificar al usuario promovido');
    }
  }
}
