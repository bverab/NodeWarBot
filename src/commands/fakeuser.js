const { SlashCommandBuilder } = require('discord.js');
const {
  loadWars,
  getLatestWarByChannelId,
  updateWarByMessageId
} = require('../services/warService');
const {
  getRoleByName,
  removeParticipantFromAllRoles,
  addParticipantToRole,
  upsertWaitlistEntry,
  removeFromWaitlist,
  pickWaitlistForRole,
  getFakeUserIdFromName
} = require('../utils/warState');
const { buildWarMessagePayload } = require('../utils/warMessageBuilder');

// Comando de test local para simular usuarios y validar waitlist/promociones.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('fakeuser')
    .setDescription('Herramientas de testing para waitlist y roles')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Agrega un usuario ficticio a un rol (o waitlist si esta lleno)')
        .addStringOption(option =>
          option
            .setName('nombre')
            .setDescription('Nombre del usuario ficticio')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol de destino')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remueve un usuario ficticio de roles y waitlist')
        .addStringOption(option =>
          option
            .setName('nombre')
            .setDescription('Nombre del usuario ficticio')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        return await handleAutocomplete(interaction);
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'add') {
        return await handleAddFakeUser(interaction);
      }

      if (subcommand === 'remove') {
        return await handleRemoveFakeUser(interaction);
      }
    } catch (error) {
      console.error('Error en fakeuser:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error ejecutando comando', flags: 64 });
      }
    }
  }
};

async function handleAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const war = await resolveActiveWar(interaction);

  if (!war || !war.roles.length) {
    return await interaction.respond([]);
  }

  const choices = war.roles
    .map(role => ({
      name: `${role.emoji || 'o'} ${role.name}`,
      value: role.name
    }))
    .filter(choice => choice.name.toLowerCase().includes(focusedValue) || choice.value.toLowerCase().includes(focusedValue))
    .slice(0, 25);

  await interaction.respond(choices);
}

async function handleAddFakeUser(interaction) {
  await interaction.deferReply({ flags: 64 });

  const war = await resolveActiveWar(interaction);
  if (!war) {
    return await interaction.editReply({ content: 'No se encontro un evento publicado en este canal' });
  }

  const fakeName = interaction.options.getString('nombre').trim();
  const roleName = interaction.options.getString('rol').trim();
  const fakeUserId = getFakeUserIdFromName(fakeName);

  const { war: updatedWar, result } = updateWarByMessageId(war.messageId, state => {
    const targetRole = getRoleByName(state, roleName);
    if (!targetRole) return { type: 'missing_role' };

    const participant = {
      userId: fakeUserId,
      displayName: fakeName,
      isFake: true
    };

    if (targetRole.users.some(user => user.userId === fakeUserId)) {
      return { type: 'already_in_role', roleName: targetRole.name };
    }

    removeParticipantFromAllRoles(state, fakeUserId);
    removeFromWaitlist(state, fakeUserId);

    if (targetRole.users.length >= targetRole.max) {
      const added = upsertWaitlistEntry(state, {
        userId: fakeUserId,
        userName: fakeName,
        roleName: targetRole.name,
        joinedAt: Date.now(),
        isFake: true
      });

      return {
        type: added ? 'waitlist_added' : 'waitlist_exists',
        roleName: targetRole.name,
        queueSize: state.waitlist.length
      };
    }

    addParticipantToRole(targetRole, participant);
    return { type: 'joined_role', roleName: targetRole.name, size: targetRole.users.length, max: targetRole.max };
  });

  if (!updatedWar || !result) {
    return await interaction.editReply({ content: 'No se pudo actualizar el evento' });
  }

  const refreshed = await refreshWarMessage(interaction, updatedWar);
  if (!refreshed) {
    return await interaction.editReply({ content: 'Evento actualizado en datos, pero no encontre el mensaje activo para refrescarlo' });
  }

  const replyByType = {
    missing_role: `El rol **${roleName}** no existe`,
    already_in_role: `**${fakeName}** ya esta en **${result.roleName}**`,
    waitlist_exists: `**${fakeName}** ya estaba en waitlist`,
    waitlist_added: `**${fakeName}** agregado a waitlist de **${result.roleName}** (#${result.queueSize})`,
    joined_role: `**${fakeName}** agregado a **${result.roleName}** (${result.size}/${result.max})`
  };

  await interaction.editReply({ content: replyByType[result.type] || 'Evento actualizado' });
}

async function handleRemoveFakeUser(interaction) {
  await interaction.deferReply({ flags: 64 });

  const war = await resolveActiveWar(interaction);
  if (!war) {
    return await interaction.editReply({ content: 'No se encontro un evento publicado en este canal' });
  }

  const fakeName = interaction.options.getString('nombre').trim();
  const fakeUserId = getFakeUserIdFromName(fakeName);

  const { war: updatedWar, result } = updateWarByMessageId(war.messageId, state => {
    const removedFromRoles = removeParticipantFromAllRoles(state, fakeUserId);
    const removedFromWaitlist = removeFromWaitlist(state, fakeUserId);

    if (!removedFromRoles && !removedFromWaitlist) {
      return { type: 'not_found' };
    }

    const promotedUsers = [];
    state.roles.forEach(role => {
      if (role.users.length >= role.max) return;

      const next = pickWaitlistForRole(state, role.name);
      if (!next) return;

      addParticipantToRole(role, {
        userId: next.userId,
        displayName: next.userName,
        isFake: next.isFake
      });

      promotedUsers.push({
        userId: next.userId,
        displayName: next.userName,
        isFake: next.isFake,
        roleName: role.name
      });
    });

    return { type: 'removed', promotedUsers };
  });

  if (!updatedWar || !result) {
    return await interaction.editReply({ content: 'No se pudo actualizar el evento' });
  }

  const refreshed = await refreshWarMessage(interaction, updatedWar);
  if (!refreshed) {
    return await interaction.editReply({ content: 'Evento actualizado en datos, pero no encontre el mensaje activo para refrescarlo' });
  }

  if (result.type === 'not_found') {
    return await interaction.editReply({ content: `**${fakeName}** no estaba en roles ni waitlist` });
  }

  for (const promotedUser of result.promotedUsers || []) {
    await notifyPromotion(interaction, updatedWar, promotedUser);
  }

  await interaction.editReply({ content: `**${fakeName}** removido del evento` });
}

async function refreshWarMessage(interaction, war) {
  try {
    const message = await interaction.channel.messages.fetch(war.messageId);
    await message.edit(buildWarMessagePayload(war));
    return true;
  } catch (error) {
    if (error?.code === 10008) {
      return false;
    }

    console.error('Error actualizando mensaje del evento:', error);
    return false;
  }
}

async function resolveActiveWar(interaction) {
  const fallback = getLatestWarByChannelId(interaction.channelId);
  const wars = loadWars()
    .filter(war => war.channelId === interaction.channelId && war.messageId)
    .sort((a, b) => b.createdAt - a.createdAt);

  try {
    const recentMessages = await interaction.channel.messages.fetch({ limit: 40 });
    const messageIds = new Set(recentMessages.map(message => message.id));

    const active = wars.find(war => messageIds.has(war.messageId));
    if (active) return active;
  } catch (error) {
    console.warn('No se pudieron leer mensajes recientes para resolver evento activo');
  }

  return fallback;
}

async function notifyPromotion(interaction, war, promotedUser) {
  if (!promotedUser || promotedUser.isFake) return;

  const roleName = promotedUser.roleName || 'el rol seleccionado';
  const eventUrl = interaction.channelId && war?.messageId
    ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${war.messageId}`
    : null;
  const eventTitle = war?.name || 'Evento';
  const text = eventUrl
    ? `Se liberó un cupo para **${roleName}** en [${eventTitle}](${eventUrl}). Ya te movimos desde la waitlist.`
    : `Se liberó un cupo para **${roleName}**. Ya te movimos desde la waitlist.`;
  const dmContent = `**¡Entraste!**\n${text}`;

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
