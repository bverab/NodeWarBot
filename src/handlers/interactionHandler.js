const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const warService = require('../services/warService');

module.exports = async (interaction) => {
  const { customId } = interaction;

  try {
    if (customId === 'add_roles_bulk') return await handleAddRolesBulkButton(interaction);
    if (customId === 'publish_war') return await handlePublishWar(interaction);
    if (customId === 'cancel_war') return await handleCancelWar(interaction);
  } catch (error) {
    console.error('❌ Error en interactionHandler:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Error', flags: 64 });
    }
  }
};

async function handleAddRolesBulkButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('add_roles_bulk')
    .setTitle('Agregar Roles');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('roles_text')
        .setLabel('Roles (nombre: slots)')
        .setPlaceholder('⚔️ Caller: 2\n🔥 DPS: 3\n💚 Healer: 1')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function handlePublishWar(interaction) {
  const warData = global.warEdits?.[interaction.user.id];
  
  if (!warData) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  if (warData.creatorId !== interaction.user.id) {
    return await interaction.reply({ content: '❌ Solo el creador puede publicar', flags: 64 });
  }

  if (warData.roles.length === 0) {
    return await interaction.reply({ content: '❌ Agrega al menos 1 rol', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  const embed = createWarEmbed(warData);
  const buttons = createRoleButtons(warData);

  const message = await interaction.channel.send({ 
    content: '<@&here> ⚔️ ¡Nuevo evento!',
    embeds: [embed], 
    components: buttons 
  });

  // Guardar con messageId
  warData.messageId = message.id;
  warService.createWar(warData);

  await interaction.editReply({ content: `✅ Evento **${warData.name}** publicado` });
  delete global.warEdits[interaction.user.id];
}

async function handleCancelWar(interaction) {
  const warData = global.warEdits?.[interaction.user.id];

  if (warData?.creatorId !== interaction.user.id) {
    return await interaction.reply({ content: '❌ Solo el creador puede cancelar', flags: 64 });
  }

  delete global.warEdits[interaction.user.id];
  await interaction.reply({ content: '❌ Evento cancelado', flags: 64 });
}

function createWarEmbed(war) {
  // Layout horizontal de roles - mostrar cada rol en su propio campo
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

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${war.name}`)
    .setDescription(war.type)
    .setColor(0x5865F2);

  if (roleFields.length > 0) {
    embed.addFields(...roleFields);
  } else {
    embed.addFields({
      name: 'Roles',
      value: '*(Sin roles)*',
      inline: false
    });
  }

  // Waitlist con emojis
  if (war.waitlist && war.waitlist.length > 0) {
    const waitlistText = war.waitlist
      .map((w, i) => {
        const roleInfo = war.roles.find(r => r.name === w.roleName);
        const roleLabel = roleInfo 
          ? `(${roleInfo.emoji || '⚪'} ${roleInfo.name})`
          : '';
        return `${i + 1}. ${w.userName} ${roleLabel}`;
      })
      .join('\n');

    embed.addFields({
      name: '📋 Waitlist',
      value: waitlistText,
      inline: false
    });
  }

  return embed.setFooter({ text: `ID: ${war.id}` });
}

function createRoleButtons(war) {
  const buttons = [];
  const rows = [];
  let currentRow = new ActionRowBuilder();

  war.roles.forEach(role => {
    const btn = new ButtonBuilder()
      .setCustomId(`join_${role.name}`)
      .setLabel(`${role.emoji || '⚪'} ${role.name} (${role.users.length}/${role.max})`)
      .setStyle(ButtonStyle.Secondary);

    if (role.users.length >= role.max) {
      btn.setDisabled(true);
    }

    buttons.push(btn);
  });

  // Máximo de 5 botones por fila
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

  return rows;
}
