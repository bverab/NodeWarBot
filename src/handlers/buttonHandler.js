const {
  getWarByMessageId,
  updateWarByMessageId,
  deleteWarByMessageId
} = require('../services/warService');
const { normalizeEventType } = require('../constants/eventTypes');
const { buildEventMessagePayload, buildEventListText } = require('../services/eventRenderService');
const pveService = require('../services/pveService');
const {
  getRoleByName,
  findParticipantRole,
  removeParticipantFromAllRoles,
  addParticipantToRole,
  upsertWaitlistEntry,
  removeFromWaitlist,
  pickWaitlistForRole
} = require('../utils/warState');
const { notifyPromotion } = require('../utils/promotionNotifier');
const { sanitizeDisplayText, safeMessageContent } = require('../utils/textSafety');
const { consumeRateLimit, buildInteractionRateKey } = require('../utils/rateLimiter');
const { logError } = require('../utils/appLogger');

// Maneja botones del mensaje publico del evento:
// - Cerrar/abrir inscripciones
// - Apagar evento
// - Ver lista
// - Unirse/cambiar/salir de rol con logica de waitlist
module.exports = async interaction => {
  try {
    if (!interaction.isButton()) return;

    const rate = consumeRateLimit(buildInteractionRateKey(interaction, 'button'), {
      windowMs: 4000,
      maxHits: 6
    });
    if (!rate.allowed) {
      return await interaction.reply({
        content: `Demasiadas acciones seguidas. Espera ${Math.ceil(rate.retryAfterMs / 1000)}s.`,
        flags: 64,
        allowedMentions: { parse: [] }
      });
    }

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

    if (interaction.customId.startsWith('pve_join_')) {
      return await handleJoinPveSlot(interaction);
    }

    if (interaction.customId === 'pve_leave') {
      return await handleLeavePveSlot(interaction);
    }
  } catch (error) {
    logError('Error en buttonHandler', error, {
      customId: interaction.customId,
      userId: interaction.user?.id,
      messageId: interaction.message?.id
    });

    try {
      await interaction.followUp({ content: 'Error interno', flags: 64 });
    } catch (replyError) {
      logError('Error enviando follow-up desde buttonHandler', replyError, {
        customId: interaction.customId,
        userId: interaction.user?.id
      });
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

  const { war } = await updateWarByMessageId(interaction.message.id, state => {
    state.isClosed = !state.isClosed;
  });

  if (!war) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  await interaction.message.edit(await buildEventMessagePayload(war));
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

  await deleteWarByMessageId(interaction.message.id);
  await interaction.message.delete().catch(() => null);
  await interaction.followUp({ content: 'Evento eliminado', flags: 64 });
}

async function handleViewList(interaction) {
  const war = getWarByMessageId(interaction.message.id);
  if (!war) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  await interaction.followUp({
    content: await buildEventListText(war),
    flags: 64
  });
}

async function handleJoinRole(interaction) {
  // Flujo principal de inscripcion:
  // 1) valida rol y permisos del usuario
  // 2) aplica join/switch/leave en estado persistente
  // 3) refresca embed y notifica promociones de waitlist
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
    displayName: sanitizeDisplayText(interaction.member?.displayName || interaction.user.username, {
      maxLength: 64,
      fallback: 'Usuario'
    }),
    isFake: false,
    userRoleIds: interaction.member?.roles?.cache
      ? Array.from(interaction.member.roles.cache.keys()).map(String)
      : []
  };

  const { war, result } = await updateWarByMessageId(interaction.message.id, state => {
    const selectedRole = getRoleByName(state, roleName);
    if (!selectedRole) return { type: 'missing_role' };

    const isAlreadyInSelectedRole = selectedRole.users.some(user => user.userId === participant.userId);

    if (isAlreadyInSelectedRole) {
      selectedRole.users = selectedRole.users.filter(user => user.userId !== participant.userId);
      const promoted = promoteFromWaitlist(state, selectedRole.name);

      return {
        type: 'left_role',
        roleName: selectedRole.name,
        promotedUsers: promoted ? [promoted] : []
      };
    }

    if (state.isClosed) {
      return { type: 'closed' };
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

      // Garantiza que el usuario tenga solo una entrada en waitlist (actualiza al nuevo rol objetivo).
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

    let promotedUsers = [];
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

  if (!war || !result) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }

  await interaction.message.edit(await buildEventMessagePayload(war));

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
    content: safeMessageContent(responseByType[result.type] || 'Evento actualizado', 'Evento actualizado'),
    flags: 64
  });

  for (const promotedUser of result.promotedUsers || []) {
    await notifyPromotion(interaction, war, promotedUser);
  }
}

async function handleJoinPveSlot(interaction) {
  const event = getWarByMessageId(interaction.message.id);
  if (!event) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }
  if (normalizeEventType(event.eventType) !== 'pve') {
    return await interaction.followUp({ content: 'Este evento no usa horarios PvE.', flags: 64 });
  }

  const optionId = String(interaction.customId || '').replace('pve_join_', '').trim();
  if (!optionId) {
    return await interaction.followUp({ content: 'Horario invalido.', flags: 64 });
  }

  const participant = {
    userId: interaction.user.id,
    displayName: sanitizeDisplayText(interaction.member?.displayName || interaction.user.username, {
      maxLength: 64,
      fallback: 'Usuario'
    }),
    isFake: false
  };

  const result = await pveService.joinSlot(event.id, optionId, participant);

  if (result.ok) {
    const refreshed = getWarByMessageId(interaction.message.id);
    if (refreshed) {
      await interaction.message.edit(await buildEventMessagePayload(refreshed));
    }
    return;
  }

  const responseByReason = {
    event_missing: 'No se encontro el evento.',
    option_missing: 'Ese horario ya no existe.',
    closed: 'Las inscripciones estan cerradas.',
    full: 'Ese horario ya esta lleno.',
    already_joined_same_option: 'Ya estabas inscrito en ese horario.',
    already_filler_same_option: 'Ya estabas registrado como Filler en ese horario.',
    already_registered_other_state_same_option: 'Ya estabas registrado en ese horario con otro estado.'
  };

  return await interaction.followUp({
    content: responseByReason[result.reason] || 'No se pudo completar la inscripcion.',
    flags: 64
  });
}

async function handleLeavePveSlot(interaction) {
  const event = getWarByMessageId(interaction.message.id);
  if (!event) {
    return await interaction.followUp({ content: 'No se encontro el evento', flags: 64 });
  }
  if (normalizeEventType(event.eventType) !== 'pve') {
    return await interaction.followUp({ content: 'Este evento no usa horarios PvE.', flags: 64 });
  }

  const left = await pveService.leaveSlot(event.id, interaction.user.id);
  const refreshed = getWarByMessageId(interaction.message.id);
  if (refreshed) {
    await interaction.message.edit(await buildEventMessagePayload(refreshed));
  }
  if (!left) {
    return await interaction.followUp({
      content: 'No estabas inscrito en este evento.',
      flags: 64
    });
  }
}

function promoteFromWaitlist(state, roleName) {
  // Promueve al primer usuario en waitlist dirigido a ese rol.
  const role = getRoleByName(state, roleName);
  if (!role || role.users.length >= role.max) return null;

  const nextInWaitlist = pickWaitlistForRole(state, role.name);
  if (!nextInWaitlist) return null;

  const promoted = {
    userId: nextInWaitlist.userId,
    displayName: sanitizeDisplayText(nextInWaitlist.userName, { maxLength: 64, fallback: 'Usuario' }),
    isFake: nextInWaitlist.isFake
  };

  addParticipantToRole(role, promoted);
  return {
    ...promoted,
    roleName: role.name
  };
}
