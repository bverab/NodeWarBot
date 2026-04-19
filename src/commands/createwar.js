const { SlashCommandBuilder } = require('discord.js');
const { showCreateEventModal } = require('../utils/createEventModal');
const { safeEphemeralReply } = require('../utils/interactionReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createwar')
    .setDescription('Alias legacy de /event create tipo:war'),

  async execute(interaction) {
    try {
      await showCreateEventModal(interaction, 'war');
    } catch (error) {
      console.error('Error en createwar:', error);
      await safeEphemeralReply(interaction, 'Error al abrir el formulario');
    }
  }
};
