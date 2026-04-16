const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createwar')
    .setDescription('🎯 Crea un nuevo evento de Node War'),

  async execute(interaction) {
    try {
      const modal = new ModalBuilder()
        .setCustomId('create_war_initial')
        .setTitle('Crear Evento');

      const nameInput = new TextInputBuilder()
        .setCustomId('war_name_input')
        .setLabel('📝 Nombre')
        .setPlaceholder('ej: Node War T2')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

      const typeInput = new TextInputBuilder()
        .setCustomId('war_type_input')
        .setLabel('🎯 Tipo/Descripción')
        .setPlaceholder('ej: Guerra territorial')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(80);

      const rolesInput = new TextInputBuilder()
        .setCustomId('initial_roles_input')
        .setLabel('👥 Roles (opcional)')
        .setPlaceholder('⚔️ Caller: 2\n🛡️ Tank: 1\n💚 Healer: 1')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(nameInput);
      const row2 = new ActionRowBuilder().addComponents(typeInput);
      const row3 = new ActionRowBuilder().addComponents(rolesInput);

      modal.addComponents(row1, row2, row3);
      await interaction.showModal(modal);

    } catch (error) {
      console.error('❌ Error en createwar:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Error al abrir el formulario',
          flags: 64
        });
      }
    }
  }
};