const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createwar')
    .setDescription('Crea un nuevo evento de Node War'),

  async execute(interaction) {
    try {
      const modal = new ModalBuilder()
        .setCustomId('create_war_initial')
        .setTitle('Crear Evento');

      const nameInput = new TextInputBuilder()
        .setCustomId('war_name_input')
        .setLabel('Nombre')
        .setPlaceholder('ej: Node War T2')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

      const typeInput = new TextInputBuilder()
        .setCustomId('war_type_input')
        .setLabel('Horario o descripcion')
        .setPlaceholder('ej: Viernes 23:00 - 00:10')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(80);

      const rolesInput = new TextInputBuilder()
        .setCustomId('initial_roles_input')
        .setLabel('Roles (opcional)')
        .setPlaceholder('⚡ Dosa: 1 \nCaller: 2')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(nameInput);
      const row2 = new ActionRowBuilder().addComponents(typeInput);
      const row3 = new ActionRowBuilder().addComponents(rolesInput);

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
