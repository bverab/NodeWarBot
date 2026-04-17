const { SlashCommandBuilder } = require('discord.js');
const { showCreateEventModal } = require('../utils/createEventModal');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createwar')
    .setDescription('Alias legacy de /event create tipo:war'),

  async execute(interaction) {
    try {
      await showCreateEventModal(interaction, 'war');
    } catch (error) {
      console.error('Error en createwar:', error);
      await safeReply(interaction, 'Error al abrir el formulario');
    }
  }
};

async function safeReply(interaction, content) {
  try {
    if (interaction.replied || interaction.deferred) return;
    await interaction.reply({ content, flags: 64 });
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      console.warn(`No se pudo responder createwar (${error.code})`);
      return;
    }
    throw error;
  }
}
