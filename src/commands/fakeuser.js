const { SlashCommandBuilder } = require('discord.js');
const { loadWars, updateWar } = require('../services/warService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fakeuser')
    .setDescription('👤 Agrega un usuario ficticio a un evento (solo para testing)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Agrega un usuario ficticio a un rol')
        .addStringOption(option =>
          option
            .setName('nombre')
            .setDescription('Nombre del usuario ficticio')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol al que agregar')
            .setRequired(true)
            .setAutocomplete(true)
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
    } catch (error) {
      console.error('❌ Error en fakeuser:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Error ejecutando comando',
          flags: 64
        });
      }
    }
  }
};

async function handleAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused();

  try {
    // Buscar evento en el canal
    const messages = await interaction.channel.messages.fetch({ limit: 20 }).catch(() => null);
    
    if (!messages) {
      return await interaction.respond([]);
    }

    const eventMessage = Array.from(messages.values())
      .reverse()
      .find(m => m.author.id === interaction.client.user.id && m.embeds && m.embeds[0]?.title?.includes('⚔️'));

    if (!eventMessage) {
      console.log('❌ No se encontró mensaje de evento');
      return await interaction.respond([]);
    }

    const wars = loadWars();
    const war = wars.find(w => w.messageId === eventMessage.id);

    if (!war || !war.roles || war.roles.length === 0) {
      console.log('❌ No se encontró war o no tiene roles');
      return await interaction.respond([]);
    }

    // Filtrar roles que coincidan con el input
    const choices = war.roles
      .map(role => ({
        name: `${role.emoji || '⚪'} ${role.name}`,
        value: role.name
      }))
      .filter(choice => 
        choice.value.toLowerCase().includes(focusedValue.toLowerCase()) ||
        choice.name.toLowerCase().includes(focusedValue.toLowerCase())
      )
      .slice(0, 25);

    await interaction.respond(choices);
  } catch (error) {
    console.error('❌ Error en autocompletado:', error);
    await interaction.respond([]);
  }
}

async function handleAddFakeUser(interaction) {
  await interaction.deferReply({ flags: 64 });

  const fakeUserName = interaction.options.getString('nombre');
  const roleName = interaction.options.getString('rol');

  // Buscar el último mensaje de evento en el canal
  const messages = await interaction.channel.messages.fetch({ limit: 10 });
  const eventMessage = messages
    .reverse()
    .find(m => m.author.id === interaction.client.user.id && m.embeds && m.embeds[0]?.title?.includes('⚔️'));

  if (!eventMessage) {
    return await interaction.editReply({
      content: '❌ No se encontró ningún evento en este canal'
    });
  }

  const wars = loadWars();
  const war = wars.find(w => w.messageId === eventMessage.id);
  if (!war) {
    return await interaction.editReply({
      content: '❌ No se pudo cargar el evento. Intenta publicar el evento de nuevo.'
    });
  }

  const role = war.roles.find(r => r.name.toLowerCase() === roleName.toLowerCase());
  if (!role) {
    return await interaction.editReply({
      content: `❌ El rol "**${roleName}**" no existe.`
    });
  }

  // Verificar si el usuario ficticio ya está en el rol
  if (role.users.some(u => u.startsWith(fakeUserName + ' ('))) {
    return await interaction.editReply({
      content: `⚠️ **${fakeUserName}** ya está en **${role.name}**`
    });
  }

  // Si el rol está lleno, agregar a waitlist
  if (role.users.length >= role.max) {
    const fakeId = `fake_${Date.now()}`;
    if (war.waitlist.some(w => w.userId === fakeId || w.userName === fakeUserName)) {
      return await interaction.editReply({
        content: `⚠️ **${fakeUserName}** ya está en la lista de espera`
      });
    }

    war.waitlist.push({
      userId: fakeId,
      userName: fakeUserName,
      roleName: role.name,
      joinedAt: Date.now()
    });

    updateWar(war);
    await interaction.editReply({
      content: `✅ **${fakeUserName}** agregado a la **lista de espera** de **${role.emoji || '⚪'} ${role.name}** (#${war.waitlist.length})`
    });
  } else {
    // Agregar directamente al rol
    const fakeId = `fake_${Date.now()}`;
    const fakeUserEntry = `${fakeUserName} (${fakeId})`;
    role.users.push(fakeUserEntry);
    updateWar(war);
    await interaction.editReply({
      content: `✅ **${fakeUserName}** agregado a **${role.emoji || '⚪'} ${role.name}** (${role.users.length}/${role.max})`
    });
  }

  // Actualizar el embed del evento
  try {
    await eventMessage.edit(await buildEventMessage(war));
  } catch (e) {
    console.error('❌ Error actualizando evento:', e);
  }
}

async function buildEventMessage(war) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${war.name}`)
    .setDescription(war.type)
    .setColor(0x5865F2);

  // Cada rol en su propio campo
  const roleFields = war.roles.map(role => {
    const users = role.users.length > 0
      ? role.users.join('\n')
      : '—';

    return {
      name: `${role.emoji || '⚪'} ${role.name}`,
      value: `${role.users.length}/${role.max}\n${users}`,
      inline: true
    };
  });

  if (roleFields.length > 0) {
    embed.addFields(...roleFields);
  }

  // Waitlist
  if (war.waitlist && war.waitlist.length > 0) {
    const waitlistText = war.waitlist
      .map((w, idx) => {
        const roleInfo = war.roles.find(r => r.name === w.roleName);
        const roleLabel = roleInfo
          ? `(${roleInfo.emoji || '⚪'} ${roleInfo.name})`
          : '';
        return `${idx + 1}. ${w.userName} ${roleLabel}`;
      })
      .join('\n');

    embed.addFields({
      name: `📋 Waitlist (${war.waitlist.length})`,
      value: waitlistText,
      inline: false
    });
  }

  // Botones
  const buttons = [];
  let currentRow = new ActionRowBuilder();

  war.roles.forEach(role => {
    const btn = new ButtonBuilder()
      .setCustomId(`join_${role.name}`)
      .setLabel(`${role.emoji || '⚪'} ${role.name} (${role.users.length}/${role.max})`)
      .setStyle(ButtonStyle.Secondary);

    buttons.push(btn);
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i++) {
    if (i > 0 && i % 5 === 0) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(buttons[i]);
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  return { embeds: [embed], components: rows };
}
