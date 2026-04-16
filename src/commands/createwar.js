const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createwar')
    .setDescription('Crea eventos de Node War para uno o múltiples días de la semana'),

  async execute(interaction) {
    try {
      const modal = new ModalBuilder()
        .setCustomId('create_war_initial')
        .setTitle('Crear Evento de Node War');

      const nameInput = new TextInputBuilder()
        .setCustomId('war_name_input')
        .setLabel('Nombre del evento')
        .setPlaceholder('ej: Node War T2')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

      const typeInput = new TextInputBuilder()
        .setCustomId('war_type_input')
        .setLabel('Descripción/Horario')
        .setPlaceholder('ej: Guerras de semana')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(80);

      const timezoneInput = new TextInputBuilder()
        .setCustomId('war_timezone_input')
        .setLabel('Zona horaria (ej: America/Bogota)')
        .setPlaceholder('America/Bogota')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(50);

      const row1 = new ActionRowBuilder().addComponents(nameInput);
      const row2 = new ActionRowBuilder().addComponents(typeInput);
      const row3 = new ActionRowBuilder().addComponents(timezoneInput);

      modal.addComponents(row1, row2, row3);
      await interaction.showModal(modal);
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
