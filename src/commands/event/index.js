const { SlashCommandBuilder } = require('discord.js');
const { showCreateEventModal } = require('../../utils/createEventModal');
const warService = require('../../services/warService');
const templateService = require('../../services/templateService');
const { buildEventSelectorPayload } = require('../../utils/eventAdminUi');
const { isAdminExecutor, resolveTargetWar } = require('../eventadminShared');
const { safeEphemeralReply } = require('../../utils/interactionReply');
const { publishOrRefreshWar } = require('../../services/eventPublicationService');
const { safeMessageContent } = require('../../utils/textSafety');
const { logError } = require('../../utils/appLogger');
const { buildEventTypeChoices } = require('./eventPve');
const { buildTemplateTypeChoices, handleEventTemplate, autocompleteTemplate } = require('./eventTemplate');
const { handleEventCreate, autocompleteCreateTemplate } = require('./eventCreate');
const { handleEventEdit } = require('./eventEdit');
const { handleEventPublish, autocompletePublishEventId } = require('./eventPublish');
const { handleScheduleView, handleScheduleCancel, autocompleteScheduleCancel } = require('./eventAdmin');
const { getSanitizedOption } = require('./eventShared');

function buildEventCommandData() {
  return new SlashCommandBuilder()
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
            .addChoices(...buildEventTypeChoices(true))
        )
        .addStringOption(option =>
          option
            .setName('plantilla')
            .setDescription('Plantilla opcional compatible con el tipo')
            .setRequired(false)
            .setAutocomplete(true)
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
    )
    .addSubcommandGroup(group =>
      group
        .setName('template')
        .setDescription('Gestiona plantillas reutilizables de eventos')
        .addSubcommand(subcommand =>
          subcommand
            .setName('create')
            .setDescription('Crea una plantilla a partir de un evento existente')
            .addStringOption(option =>
              option
                .setName('tipo')
                .setDescription('Tipo de evento de la plantilla')
                .setRequired(true)
                .addChoices(...buildTemplateTypeChoices())
            )
            .addStringOption(option =>
              option
                .setName('nombre')
                .setDescription('Nombre de la plantilla')
                .setRequired(true)
                .setMaxLength(50)
            )
            .addStringOption(option =>
              option
                .setName('evento_id')
                .setDescription('Evento base para copiar estructura/ajustes')
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addBooleanOption(option =>
              option
                .setName('sobrescribir')
                .setDescription('Si existe una plantilla con el mismo nombre/tipo, la actualiza')
                .setRequired(false)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('update')
            .setDescription('Actualiza una plantilla existente desde un evento origen')
            .addStringOption(option =>
              option
                .setName('id')
                .setDescription('ID de la plantilla a actualizar')
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption(option =>
              option
                .setName('evento_id')
                .setDescription('Evento/serie origen para refrescar la plantilla')
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption(option =>
              option
                .setName('nombre')
                .setDescription('Nuevo nombre opcional de la plantilla')
                .setRequired(false)
                .setMaxLength(50)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('Lista plantillas del servidor')
            .addStringOption(option =>
              option
                .setName('tipo')
                .setDescription('Filtrar por tipo de evento')
                .setRequired(false)
                .addChoices(...buildTemplateTypeChoices())
            )
            .addBooleanOption(option =>
              option
                .setName('incluir_archivadas')
                .setDescription('Incluir plantillas archivadas')
                .setRequired(false)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('archive')
            .setDescription('Archiva una plantilla')
            .addStringOption(option =>
              option
                .setName('id')
                .setDescription('ID de la plantilla')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('restore')
            .setDescription('Restaura una plantilla archivada')
            .addStringOption(option =>
              option
                .setName('id')
                .setDescription('ID de la plantilla')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
    );
}

function buildDeps() {
  return {
    showCreateEventModal,
    templateService,
    warService,
    buildEventSelectorPayload,
    isAdminExecutor,
    resolveTargetWar,
    safeEphemeralReply,
    publishOrRefreshWar,
    safeMessageContent,
    getSanitizedOption
  };
}

async function handleAutocomplete(interaction, deps) {
  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused(true);

  if (group === null && subcommand === 'create' && focused?.name === 'plantilla') {
    return await autocompleteCreateTemplate(interaction, deps);
  }

  if (group === 'template') {
    return await autocompleteTemplate(interaction, subcommand, focused?.name, deps);
  }

  if (group === null && subcommand === 'publish') {
    return await autocompletePublishEventId(interaction, deps);
  }

  if (group === 'schedule' && subcommand === 'cancel') {
    return await autocompleteScheduleCancel(interaction, deps);
  }

  await interaction.respond([]);
}

module.exports = {
  data: buildEventCommandData(),

  async execute(interaction) {
    const deps = buildDeps();
    try {
      if (interaction.isAutocomplete()) {
        return await handleAutocomplete(interaction, deps);
      }

      const group = interaction.options.getSubcommandGroup(false);
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'create' && !group) {
        return await handleEventCreate(interaction, deps);
      }

      if (group === 'template') {
        return await handleEventTemplate(interaction, subcommand, deps);
      }

      if (subcommand === 'edit') {
        return await handleEventEdit(interaction, deps);
      }

      if (subcommand === 'publish') {
        return await handleEventPublish(interaction, deps);
      }

      if (group === 'schedule' && subcommand === 'view') {
        return await handleScheduleView(interaction, deps);
      }

      if (group === 'schedule' && subcommand === 'cancel') {
        return await handleScheduleCancel(interaction, deps);
      }

      return await safeEphemeralReply(interaction, 'Subcomando no soportado');
    } catch (error) {
      logError('Error en event', error, { userId: interaction.user?.id, command: 'event' });
      await safeEphemeralReply(interaction, 'Error al ejecutar /event');
    }
  }
};
