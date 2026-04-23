const { SlashCommandBuilder } = require('discord.js');
const { showCreateEventModal } = require('../utils/createEventModal');
const { normalizeEventType } = require('../constants/eventTypes');
const warService = require('../services/warService');
const templateService = require('../services/templateService');
const { buildEventSelectorPayload } = require('../utils/eventAdminUi');
const { isAdminExecutor, resolveTargetWar } = require('./eventadminShared');
const { safeEphemeralReply } = require('../utils/interactionReply');
const { publishOrRefreshWar } = require('../services/eventPublicationService');

function buildEventTypeChoices(includePlaceholder = true) {
  const choices = [
    { name: 'War', value: 'war' },
    { name: 'Siege', value: 'siege' },
    { name: 'PvE', value: 'pve' }
  ];
  if (includePlaceholder) {
    choices.push({ name: '10v10 (placeholder)', value: '10v10' });
  }
  return choices;
}

function buildTemplateTypeChoices() {
  return [
    { name: 'War', value: 'war' },
    { name: 'Siege', value: 'siege' }
  ];
}

function isReusableTemplateSourceForGuild(war, interaction) {
  if (!war) return false;
  if (String(war.guildId || '') === String(interaction.guildId || '')) return true;
  // Compatibilidad legacy: eventos sin guildId solo se consideran dentro del canal actual.
  return !war.guildId && String(war.channelId || '') === String(interaction.channelId || '');
}

function toNumberOrFallback(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function sortWarsForSeriesBaseline(a, b) {
  const dayDiff = toNumberOrFallback(a.dayOfWeek, 99) - toNumberOrFallback(b.dayOfWeek, 99);
  if (dayDiff !== 0) return dayDiff;
  const timeA = String(a.time || '99:99');
  const timeB = String(b.time || '99:99');
  if (timeA !== timeB) return timeA.localeCompare(timeB);
  return toNumberOrFallback(a.createdAt, 0) - toNumberOrFallback(b.createdAt, 0);
}

function buildTemplateSourceCandidates(interaction, type = null) {
  const wars = warService
    .loadWars()
    .filter(war => isReusableTemplateSourceForGuild(war, interaction))
    .filter(war => !type || normalizeEventType(war.eventType) === type);

  const recurringByGroup = new Map();
  const singles = [];

  for (const war of wars) {
    const isRecurringSeries = war.schedule?.mode !== 'once' && Boolean(war.groupId);
    if (!isRecurringSeries) {
      singles.push({
        key: `event:${war.id}`,
        kind: 'single',
        source: war
      });
      continue;
    }

    if (!recurringByGroup.has(war.groupId)) {
      recurringByGroup.set(war.groupId, []);
    }
    recurringByGroup.get(war.groupId).push(war);
  }

  const seriesEntries = Array.from(recurringByGroup.entries()).map(([groupId, entries]) => {
    const ordered = [...entries].sort(sortWarsForSeriesBaseline);
    return {
      key: `group:${groupId}`,
      kind: 'series',
      groupId,
      source: ordered[0],
      members: ordered
    };
  });

  return [...seriesEntries, ...singles];
}

function buildTemplateSourceOptions(interaction, type = null, focusedText = '') {
  const query = String(focusedText || '').toLowerCase();
  return buildTemplateSourceCandidates(interaction, type)
    .map(candidate => {
      const source = candidate.source;
      const label = candidate.kind === 'series'
        ? `[Serie] ${source.name} | ${source.time || '--:--'} | ${candidate.groupId}`
        : `[Unico] ${source.name} | ${source.time || '--:--'} | ${source.id}`;
      return {
        name: label.slice(0, 100),
        value: candidate.kind === 'series' ? `series:${candidate.groupId}` : `event:${source.id}`
      };
    })
    .filter(item => item.name.toLowerCase().includes(query) || item.value.toLowerCase().includes(query))
    .slice(0, 25);
}

function resolveTemplateSourceFromValue(interaction, type, rawValue) {
  const value = String(rawValue || '').trim();
  const candidates = buildTemplateSourceCandidates(interaction, type);

  if (value.startsWith('series:')) {
    const groupId = value.slice('series:'.length).trim();
    return candidates.find(candidate => candidate.kind === 'series' && candidate.groupId === groupId)?.source || null;
  }

  if (value.startsWith('event:')) {
    const eventId = value.slice('event:'.length).trim();
    return candidates.find(candidate => candidate.source.id === eventId)?.source || null;
  }

  const directById = candidates.find(candidate => candidate.source.id === value);
  if (directById) return directById.source;

  return candidates.find(candidate => candidate.kind === 'series' && candidate.groupId === value)?.source || null;
}

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

      if (subcommand === 'create' && !group) {
        if (eventType === '10v10') {
          return await safeEphemeralReply(
            interaction,
            '10v10 esta en roadmap. Por ahora usa /event create tipo:war o tipo:siege.'
          );
        }

        const templateValue = interaction.options.getString('plantilla');
        let template = null;
        if (templateValue) {
          template = await templateService.findTemplateByIdOrName(interaction.guildId, eventType, templateValue);
          if (!template || template.isArchived) {
            return await safeEphemeralReply(
              interaction,
              'No se encontro una plantilla activa compatible con ese tipo.'
            );
          }
        }

        await showCreateEventModal(interaction, eventType, { template });
        return;
      }

      if (group === 'template') {
        if (!isAdminExecutor(interaction)) {
          return await safeEphemeralReply(interaction, 'Solo Admin puede gestionar plantillas.');
        }

        if (subcommand === 'create') {
          const type = normalizeEventType(interaction.options.getString('tipo', true));
          const name = interaction.options.getString('nombre', true).trim();
          const eventId = interaction.options.getString('evento_id', true).trim();
          const overwrite = Boolean(interaction.options.getBoolean('sobrescribir') || false);
          const source = resolveTemplateSourceFromValue(interaction, type, eventId);

          if (!source) {
            return await safeEphemeralReply(interaction, `No se encontro el evento base \`${eventId}\`.`);
          }
          if (normalizeEventType(source.eventType) !== type) {
            return await safeEphemeralReply(
              interaction,
              `El evento base es tipo \`${source.eventType}\` y no coincide con \`${type}\`.`
            );
          }

          try {
            if (overwrite) {
              const existing = await templateService.findTemplateByName(interaction.guildId, type, name);
              if (existing) {
                const updated = await templateService.updateTemplateFromWar(interaction.guildId, existing.id, source, {
                  unarchive: true
                });
                return await safeEphemeralReply(
                  interaction,
                  `Plantilla sobreescrita: \`${updated.id}\`\nNombre: **${updated.name}**\nTipo: **${updated.eventType}**\nRoles: ${updated.roleSlots.length}`
                );
              }
            }

            const template = await templateService.createTemplateFromWar(interaction.guildId, type, name, source);
            return await safeEphemeralReply(
              interaction,
              `Plantilla creada: \`${template.id}\`\nNombre: **${template.name}**\nTipo: **${template.eventType}**\nRoles: ${template.roleSlots.length}`
            );
          } catch (error) {
            if (error?.code === 'P2002') {
              return await safeEphemeralReply(
                interaction,
                'Ya existe una plantilla con ese nombre para ese tipo en este servidor.'
              );
            }
            throw error;
          }
        }

        if (subcommand === 'update') {
          const templateId = interaction.options.getString('id', true).trim();
          const sourceValue = interaction.options.getString('evento_id', true).trim();
          const newName = interaction.options.getString('nombre')?.trim();
          const existing = await templateService.getTemplateById(interaction.guildId, templateId);
          if (!existing) {
            return await safeEphemeralReply(interaction, `No se encontro plantilla \`${templateId}\`.`);
          }

          const source = resolveTemplateSourceFromValue(interaction, normalizeEventType(existing.eventType), sourceValue);
          if (!source) {
            return await safeEphemeralReply(interaction, `No se encontro el evento base \`${sourceValue}\`.`);
          }

          if (normalizeEventType(source.eventType) !== normalizeEventType(existing.eventType)) {
            return await safeEphemeralReply(
              interaction,
              `El evento origen es tipo \`${source.eventType}\` y la plantilla es \`${existing.eventType}\`.`
            );
          }

          try {
            const updated = await templateService.updateTemplateFromWar(interaction.guildId, templateId, source, {
              name: newName || null
            });
            return await safeEphemeralReply(
              interaction,
              `Plantilla actualizada: \`${updated.id}\`\nNombre: **${updated.name}**\nTipo: **${updated.eventType}**\nRoles: ${updated.roleSlots.length}`
            );
          } catch (error) {
            if (error?.code === 'P2002') {
              return await safeEphemeralReply(
                interaction,
                'No se pudo renombrar: ya existe otra plantilla con ese nombre/tipo en este servidor.'
              );
            }
            throw error;
          }
        }

        if (subcommand === 'list') {
          const type = interaction.options.getString('tipo');
          const includeArchived = Boolean(interaction.options.getBoolean('incluir_archivadas') || false);
          const templates = await templateService.listTemplatesByGuild(interaction.guildId, {
            eventType: type ? normalizeEventType(type) : undefined,
            includeArchived
          });

          if (!templates.length) {
            return await safeEphemeralReply(interaction, 'No hay plantillas para ese filtro.');
          }

          const lines = templates
            .slice(0, 20)
            .map(template => {
              const status = template.isArchived ? 'archivada' : 'activa';
              return `• \`${template.id}\` | **${template.name}** | ${template.eventType} | roles:${template.roleSlots.length} | ${status}`;
            });
          return await safeEphemeralReply(interaction, `Plantillas (${templates.length}):\n${lines.join('\n')}`);
        }

        if (subcommand === 'archive' || subcommand === 'restore') {
          const templateId = interaction.options.getString('id', true).trim();
          const archived = subcommand === 'archive';
          const updated = await templateService.archiveTemplate(interaction.guildId, templateId, archived);
          if (!updated) {
            return await safeEphemeralReply(interaction, `No se encontro plantilla \`${templateId}\`.`);
          }

          return await safeEphemeralReply(
            interaction,
            `${archived ? 'Plantilla archivada' : 'Plantilla restaurada'}: \`${updated.id}\` (**${updated.name}**)`
          );
        }
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
  const focused = interaction.options.getFocused(true);
  const focusedText = String(focused?.value || '').toLowerCase();

  if (group === null && subcommand === 'create' && focused?.name === 'plantilla') {
    const eventTypeRaw = interaction.options.getString('tipo');
    if (!eventTypeRaw) {
      return await interaction.respond([]);
    }

    const eventType = normalizeEventType(eventTypeRaw);
    if (eventType === '10v10') {
      return await interaction.respond([]);
    }

    const templates = await templateService.listTemplatesByGuild(interaction.guildId, {
      eventType,
      includeArchived: false
    });

    const options = templates
      .map(template => ({
        name: `${template.name} | roles:${template.roleSlots.length} | ${template.id}`.slice(0, 100),
        value: template.id
      }))
      .filter(item => item.name.toLowerCase().includes(focusedText) || item.value.toLowerCase().includes(focusedText))
      .slice(0, 25);

    return await interaction.respond(options);
  }

  if (group === 'template' && subcommand === 'create' && focused?.name === 'evento_id') {
    const typeRaw = interaction.options.getString('tipo');
    const type = typeRaw ? normalizeEventType(typeRaw) : null;
    const options = buildTemplateSourceOptions(interaction, type, focusedText);

    return await interaction.respond(options);
  }

  if (group === 'template' && subcommand === 'update' && focused?.name === 'id') {
    const templates = await templateService.listTemplatesByGuild(interaction.guildId, {
      includeArchived: false
    });

    const options = templates
      .map(template => ({
        name: `${template.name} | ${template.eventType} | ${template.id}`.slice(0, 100),
        value: template.id
      }))
      .filter(item => item.name.toLowerCase().includes(focusedText) || item.value.toLowerCase().includes(focusedText))
      .slice(0, 25);

    return await interaction.respond(options);
  }

  if (group === 'template' && subcommand === 'update' && focused?.name === 'evento_id') {
    const templateId = interaction.options.getString('id');
    if (!templateId) {
      return await interaction.respond([]);
    }

    const template = await templateService.getTemplateById(interaction.guildId, templateId);
    if (!template) {
      return await interaction.respond([]);
    }

    const options = buildTemplateSourceOptions(interaction, normalizeEventType(template.eventType), focusedText);
    return await interaction.respond(options);
  }

  if (group === 'template' && (subcommand === 'archive' || subcommand === 'restore') && focused?.name === 'id') {
    const templates = await templateService.listTemplatesByGuild(interaction.guildId, {
      includeArchived: true
    });

    const options = templates
      .filter(template => subcommand === 'archive' ? !template.isArchived : template.isArchived)
      .map(template => ({
        name: `${template.name} | ${template.eventType} | ${template.id}`.slice(0, 100),
        value: template.id
      }))
      .filter(item => item.name.toLowerCase().includes(focusedText) || item.value.toLowerCase().includes(focusedText))
      .slice(0, 25);

    return await interaction.respond(options);
  }

  if (group === null && subcommand === 'publish') {
    const wars = warService
      .loadWars()
      .filter(war => war.channelId === interaction.channelId)
      .map(war => ({
        name: `${war.name} | ${war.time || '--:--'} | ${war.id}`.slice(0, 100),
        value: String(war.id)
      }))
      .filter(item => item.name.toLowerCase().includes(focusedText) || item.value.toLowerCase().includes(focusedText))
      .slice(0, 25);
    return await interaction.respond(wars);
  }

  if (group === 'schedule' && subcommand === 'cancel') {
    const wars = warService
      .loadWars()
      .filter(war => war.schedule?.enabled && war.channelId === interaction.channelId)
      .map(war => ({
        name: `${war.name} | ${war.time} | ${war.id}`.slice(0, 100),
        value: String(war.id)
      }))
      .filter(item => item.name.toLowerCase().includes(focusedText) || item.value.toLowerCase().includes(focusedText))
      .slice(0, 25);

    return await interaction.respond(wars);
  }

  await interaction.respond([]);
}
