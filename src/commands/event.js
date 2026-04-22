const { SlashCommandBuilder } = require('discord.js');
const { showCreateEventModal } = require('../utils/createEventModal');
const { normalizeEventType } = require('../constants/eventTypes');
const warService = require('../services/warService');
const { buildEventSelectorPayload } = require('../utils/eventAdminUi');
const { isAdminExecutor, resolveTargetWar } = require('./eventadminShared');
const { safeEphemeralReply } = require('../utils/interactionReply');
const { publishOrRefreshWar } = require('../services/eventPublicationService');

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
        .setDescription('Selecciona un evento para reabrir su panel administrativo')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('publish')
        .setDescription('Fuerza publicacion o actualizacion de un evento')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID del evento (opcional, por defecto usa el activo del canal)')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('alcance')
            .setDescription('Alcance para eventos recurrentes')
            .setRequired(false)
            .addChoices(
              { name: 'Solo ocurrencia', value: 'single' },
              { name: 'Toda la serie', value: 'series' }
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
      const eventType = subcommand === 'create'
        ? normalizeEventType(interaction.options.getString('tipo', true))
        : null;

      if (subcommand === 'create') {
        if (eventType === '10v10') {
          return await safeEphemeralReply(
            interaction,
            '10v10 esta en roadmap. Por ahora usa /event create tipo:war o tipo:siege.'
          );
        }

        await showCreateEventModal(interaction, eventType);
        return;
      }

      if (subcommand === 'edit') {
        if (!isAdminExecutor(interaction)) {
          return await safeEphemeralReply(interaction, 'Solo Admin puede gestionar eventos.');
        }

        const wars = warService.loadWars().filter(war => war.channelId === interaction.channelId);
        const payload = buildEventSelectorPayload(wars);
        await interaction.reply({ flags: 64, ...payload });
        return;
      }

      if (subcommand === 'publish') {
        if (!isAdminExecutor(interaction)) {
          return await safeEphemeralReply(interaction, 'Solo Admin puede gestionar eventos.');
        }

        await interaction.deferReply({ flags: 64 });
        const explicitId = interaction.options.getString('id');
        const scopeRaw = interaction.options.getString('alcance') || 'single';
        const target = await resolveTargetWar(interaction, explicitId);
        if (!target) {
          await interaction.editReply('No se encontro evento activo en este canal. Usa la opcion `id` si hay varios.');
          return;
        }

        const useSeries = scopeRaw === 'series' && target.schedule?.mode !== 'once' && target.groupId;
        const targets = useSeries
          ? warService.loadWars().filter(war => war.groupId === target.groupId && war.channelId === interaction.channelId)
          : [target];

        if (!targets.length) {
          await interaction.editReply('No se encontraron ocurrencias para publicar.');
          return;
        }

        let published = 0;
        let updated = 0;
        let failed = 0;

        for (const war of targets) {
          const result = await publishOrRefreshWar(interaction, war);
          if (!result.ok) {
            failed += 1;
            continue;
          }
          if (result.status === 'published') published += 1;
          if (result.status === 'updated') updated += 1;
        }

        const scopeLabel = useSeries ? 'toda la serie' : 'solo ocurrencia';
        await interaction.editReply(
          `Publicacion forzada completada (${scopeLabel}).\nPublicados: ${published}\nActualizados: ${updated}\nFallidos: ${failed}`
        );
        return;
      }

      if (group === 'schedule' && subcommand === 'view') {
        const wars = warService
          .loadWars()
          .filter(war => war.schedule?.enabled && war.channelId === interaction.channelId)
          .sort((a, b) => (a.dayOfWeek - b.dayOfWeek) || String(a.time).localeCompare(String(b.time)));

        if (!wars.length) {
          return await safeEphemeralReply(interaction, 'No hay programaciones activas en este canal.');
        }

        const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        const lines = wars.slice(0, 20).map(war => {
          const mode = war.schedule?.mode === 'once' ? 'Unico' : 'Recurrente';
          return `• \`${war.id}\` | **${war.name}** | ${dayNames[war.dayOfWeek] || '?'} ${war.time} (${war.timezone}) | ${mode}`;
        });

        return await safeEphemeralReply(interaction, `Programaciones activas (${wars.length}):\n${lines.join('\n')}`);
      }

      if (group === 'schedule' && subcommand === 'cancel') {
        const id = interaction.options.getString('id', true).trim();
        const wars = warService.loadWars();
        const target = wars.find(war => war.id === id && war.channelId === interaction.channelId);
        if (!target) {
          return await safeEphemeralReply(
            interaction,
            `No se encontro programacion con id \`${id}\` en este canal.`
          );
        }

        const filtered = wars.filter(war => !(war.id === id && war.channelId === interaction.channelId));
        await warService.saveWars(filtered);

        return await safeEphemeralReply(interaction, `Programacion cancelada: \`${id}\``);
      }

      return await safeEphemeralReply(interaction, 'Subcomando no soportado');
    } catch (error) {
      console.error('Error en event:', error);
      await safeEphemeralReply(interaction, 'Error al ejecutar /event');
    }
  }
};

async function handleAutocomplete(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();
  if (group === null && subcommand === 'publish') {
    const focused = interaction.options.getFocused().toLowerCase();
    const wars = warService
      .loadWars()
      .filter(war => war.channelId === interaction.channelId)
      .map(war => ({
        name: `${war.name} | ${war.time || '--:--'} | ${war.id}`.slice(0, 100),
        value: String(war.id)
      }))
      .filter(item => item.name.toLowerCase().includes(focused) || item.value.toLowerCase().includes(focused))
      .slice(0, 25);
    return await interaction.respond(wars);
  }

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
