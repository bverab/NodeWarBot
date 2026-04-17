const { SlashCommandBuilder } = require('discord.js');
const { showCreateEventModal } = require('../utils/createEventModal');
const { normalizeEventType } = require('../constants/eventTypes');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Gestiona eventos del bot')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Crea un evento')
        .addStringOption(option =>
          option
            .setName('tipo')
            .setDescription('Tipo de evento')
            .setRequired(true)
            .addChoices(
              { name: 'War', value: 'war' },
              { name: 'Siege', value: 'siege' },
              { name: '10v10 (placeholder)', value: '10v10' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Base para futura edicion unificada de eventos')
        .addStringOption(option =>
          option
            .setName('tipo')
            .setDescription('Tipo de evento')
            .setRequired(true)
            .addChoices(
              { name: 'War', value: 'war' },
              { name: 'Siege', value: 'siege' },
              { name: '10v10 (placeholder)', value: '10v10' }
            )
        )
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const eventType = normalizeEventType(interaction.options.getString('tipo', true));

      if (subcommand === 'create') {
        if (eventType === '10v10') {
          return await safeReply(
            interaction,
            '10v10 esta en roadmap. Por ahora usa /event create tipo:war o tipo:siege.'
          );
        }

        await showCreateEventModal(interaction, eventType);
        return;
      }

      if (subcommand === 'edit') {
        if (eventType === '10v10') {
          return await safeReply(interaction, '10v10 aun no tiene flujo de edicion.');
        }

        return await safeReply(
          interaction,
          `Edicion unificada para ${eventType} en construccion. Usa temporalmente /editrole durante la sesion de creacion.`
        );
      }

      return await safeReply(interaction, 'Subcomando no soportado');
    } catch (error) {
      console.error('Error en event:', error);
      await safeReply(interaction, 'Error al ejecutar /event');
    }
  }
};

async function safeReply(interaction, content) {
  try {
    if (interaction.replied || interaction.deferred) return;
    await interaction.reply({ content, flags: 64 });
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      console.warn(`No se pudo responder event (${error.code})`);
      return;
    }
    throw error;
  }
}
