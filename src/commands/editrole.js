const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('editrole')
    .setDescription('Edita roles del evento en creacion (sin usar modal)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('rename')
        .setDescription('Cambia el nombre de un rol del evento')
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('nombre')
            .setDescription('Nuevo nombre')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('slots')
        .setDescription('Cambia la cantidad de slots de un rol')
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option
            .setName('cantidad')
            .setDescription('Slots (mayor a 0)')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('icon')
        .setDescription('Define icono de rol (unicode o <:nombre:id>)')
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('valor')
            .setDescription('Ej: ? o <:dosa:123456789012345678>')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clearicon')
        .setDescription('Quita icono de un rol')
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Elimina un rol del evento')
        .addStringOption(option =>
          option
            .setName('rol')
            .setDescription('Rol del evento')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        return await handleAutocomplete(interaction);
      }

      await interaction.deferReply({ flags: 64 });

      const warData = getDraftWar(interaction.user.id);
      if (!warData) {
        return await interaction.editReply({ content: 'No tienes una sesion de creacion activa. Usa /createwar.' });
      }

      const subcommand = interaction.options.getSubcommand();
      const roleValue = interaction.options.getString('rol', subcommand !== 'delete' ? true : false);

      const roleContext = resolveRoleFromOption(warData, roleValue || interaction.options.getString('rol'));
      if (!roleContext) {
        return await interaction.editReply({ content: 'Rol invalido o ya no existe en la sesion actual.' });
      }

      if (subcommand === 'rename') {
        const newName = interaction.options.getString('nombre', true).trim();
        if (!newName) {
          return await interaction.editReply({ content: 'Nombre invalido.' });
        }

        roleContext.role.name = newName;
        return await interaction.editReply({ content: `Nombre actualizado: **${newName}**` });
      }

      if (subcommand === 'slots') {
        const qty = interaction.options.getInteger('cantidad', true);
        if (roleContext.role.users.length > qty) {
          return await interaction.editReply({
            content: `No puedes bajar a ${qty} porque hay ${roleContext.role.users.length} inscritos en ese rol.`
          });
        }

        roleContext.role.max = qty;
        return await interaction.editReply({ content: `Slots actualizados para **${roleContext.role.name}**: ${qty}` });
      }

      if (subcommand === 'icon') {
        const value = interaction.options.getString('valor', true).trim();
        const parsed = parseEmojiInput(value, interaction);
        if (!parsed) {
          return await interaction.editReply({ content: 'Icono invalido. Usa emoji unicode o formato <:nombre:id>.' });
        }

        roleContext.role.emoji = parsed.emoji;
        roleContext.role.emojiSource = parsed.emojiSource;
        return await interaction.editReply({ content: `Icono actualizado para **${roleContext.role.name}**: ${parsed.emoji}` });
      }

      if (subcommand === 'clearicon') {
        roleContext.role.emoji = null;
        roleContext.role.emojiSource = null;
        return await interaction.editReply({ content: `Icono removido para **${roleContext.role.name}**` });
      }

      if (subcommand === 'delete') {
        const removed = warData.roles.splice(roleContext.index, 1)[0];

        if (global.warEditSelections && Number.isInteger(global.warEditSelections[interaction.user.id])) {
          const selected = global.warEditSelections[interaction.user.id];
          if (selected === roleContext.index) {
            delete global.warEditSelections[interaction.user.id];
          } else if (selected > roleContext.index) {
            global.warEditSelections[interaction.user.id] = selected - 1;
          }
        }

        return await interaction.editReply({ content: `Rol eliminado: **${removed.name}**` });
      }

      return await interaction.editReply({ content: 'Subcomando no soportado.' });
    } catch (error) {
      console.error('Error en editrole:', error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error ejecutando editrole', flags: 64 });
      } else {
        await interaction.editReply({ content: 'Error ejecutando editrole' }).catch(() => null);
      }
    }
  }
};

async function handleAutocomplete(interaction) {
  const warData = getDraftWar(interaction.user.id);
  if (!warData || !warData.roles.length) {
    return await interaction.respond([]);
  }

  const focused = interaction.options.getFocused().toLowerCase();

  const options = warData.roles
    .map((role, index) => ({
      name: `${role.emoji || 'o'} ${role.name} (${role.users.length}/${role.max})`,
      value: `${index}|${role.name}`
    }))
    .filter(item => item.name.toLowerCase().includes(focused) || item.value.toLowerCase().includes(focused))
    .slice(0, 25);

  await interaction.respond(options);
}

function getDraftWar(userId) {
  const warData = global.warEdits?.[userId];
  if (!warData || warData.creatorId !== userId) return null;
  return warData;
}

function resolveRoleFromOption(warData, optionValue) {
  if (!optionValue) return null;

  const parts = String(optionValue).split('|');
  const index = Number.parseInt(parts[0], 10);
  if (Number.isInteger(index) && warData.roles[index]) {
    return { role: warData.roles[index], index };
  }

  const byNameIndex = warData.roles.findIndex(role => role.name === optionValue);
  if (byNameIndex >= 0) {
    return { role: warData.roles[byNameIndex], index: byNameIndex };
  }

  return null;
}

function parseEmojiInput(text, interaction) {
  const customEmojiMatch = text.match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/);
  if (customEmojiMatch) {
    const emojiId = customEmojiMatch[1];
    const isGuildEmoji = Boolean(interaction.guild?.emojis?.cache?.get(emojiId));

    return {
      emoji: text,
      emojiSource: isGuildEmoji ? 'guild' : 'custom'
    };
  }

  if (/\p{Extended_Pictographic}/u.test(text)) {
    return {
      emoji: text,
      emojiSource: 'unicode'
    };
  }

  return null;
}
