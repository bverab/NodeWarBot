const { SlashCommandBuilder } = require('discord.js');
const { showCreateEventModal } = require('../utils/createEventModal');
const { normalizeEventType } = require('../constants/eventTypes');
const warService = require('../services/warService');

// Comando principal de eventos:
// - crear evento por modal
// - ver/cancelar programaciones por ID
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
    )
    .addSubcommandGroup(group =>
      group
        .setName('schedule')
        .setDescription('Gestiona programaciones de eventos')
        .addSubcommand(subcommand =>
          subcommand
            .setName('view')
            .setDescription('Ver programaciones activas')
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('cancel')
            .setDescription('Cancelar una programacion')
            .addStringOption(option =>
              option
                .setName('id')
                .setDescription('ID de la programacion')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
    ),

  async execute(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        return await handleAutocomplete(interaction);
      }

      const group = interaction.options.getSubcommandGroup(false);
      const subcommand = interaction.options.getSubcommand();
      const eventType = group ? null : normalizeEventType(interaction.options.getString('tipo', true));

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

      if (group === 'schedule' && subcommand === 'view') {
        const wars = warService
          .loadWars()
          .filter(war => war.schedule?.enabled && war.channelId === interaction.channelId)
          .sort((a, b) => (a.dayOfWeek - b.dayOfWeek) || String(a.time).localeCompare(String(b.time)));

        if (!wars.length) {
          return await safeReply(interaction, 'No hay programaciones activas en este canal.');
        }

        const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        const lines = wars.slice(0, 20).map(war => {
          const mode = war.schedule?.mode === 'once' ? 'Unico' : 'Recurrente';
          return `• \`${war.id}\` | **${war.name}** | ${dayNames[war.dayOfWeek] || '?'} ${war.time} (${war.timezone}) | ${mode}`;
        });

        return await safeReply(interaction, `Programaciones activas (${wars.length}):\n${lines.join('\n')}`);
      }

      if (group === 'schedule' && subcommand === 'cancel') {
        const id = interaction.options.getString('id', true).trim();
        const wars = warService.loadWars();
        const target = wars.find(war => war.id === id);
        if (!target) {
          return await safeReply(interaction, `No se encontro programacion con id \`${id}\`.`);
        }

        const filtered = wars.filter(war => war.id !== id);
        warService.saveWars(filtered);

        return await safeReply(interaction, `Programacion cancelada: \`${id}\``);
      }

      return await safeReply(interaction, 'Subcomando no soportado');
    } catch (error) {
      console.error('Error en event:', error);
      await safeReply(interaction, 'Error al ejecutar /event');
    }
  }
};

async function handleAutocomplete(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();
  if (group !== 'schedule' || subcommand !== 'cancel') {
    return await interaction.respond([]);
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const wars = warService
    .loadWars()
    .filter(war => war.schedule?.enabled && war.channelId === interaction.channelId)
    .map(war => ({
      name: `${war.name} | ${war.time} | ${war.id}`.slice(0, 100),
      value: String(war.id)
    }))
    .filter(item => item.name.toLowerCase().includes(focused) || item.value.toLowerCase().includes(focused))
    .slice(0, 25);

  await interaction.respond(wars);
}

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
