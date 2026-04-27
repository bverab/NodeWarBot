const { normalizeEventType } = require('../../constants/eventTypes');

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

function buildTemplateSourceCandidates(interaction, warService, type = null) {
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

function buildTemplateSourceOptions(interaction, warService, type = null, focusedText = '') {
  const query = String(focusedText || '').toLowerCase();
  return buildTemplateSourceCandidates(interaction, warService, type)
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

function resolveTemplateSourceFromValue(interaction, warService, type, rawValue) {
  const value = String(rawValue || '').trim();
  const candidates = buildTemplateSourceCandidates(interaction, warService, type);

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

async function handleEventTemplate(interaction, subcommand, deps) {
  const {
    isAdminExecutor,
    safeEphemeralReply,
    templateService,
    warService,
    getSanitizedOption
  } = deps;

  if (!isAdminExecutor(interaction)) {
    return await safeEphemeralReply(interaction, 'Solo Admin puede gestionar plantillas.');
  }

  if (subcommand === 'create') {
    const type = normalizeEventType(interaction.options.getString('tipo', true));
    const name = getSanitizedOption(interaction, 'nombre', { required: true, maxLength: 50 });
    const eventId = getSanitizedOption(interaction, 'evento_id', { required: true, maxLength: 64 });
    const overwrite = Boolean(interaction.options.getBoolean('sobrescribir') || false);
    const source = resolveTemplateSourceFromValue(interaction, warService, type, eventId);

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
    const templateId = getSanitizedOption(interaction, 'id', { required: true, maxLength: 64 });
    const sourceValue = getSanitizedOption(interaction, 'evento_id', { required: true, maxLength: 64 });
    const newName = getSanitizedOption(interaction, 'nombre', { maxLength: 50, allowEmpty: true });
    const existing = await templateService.getTemplateById(interaction.guildId, templateId);
    if (!existing) {
      return await safeEphemeralReply(interaction, `No se encontro plantilla \`${templateId}\`.`);
    }

    const source = resolveTemplateSourceFromValue(interaction, warService, normalizeEventType(existing.eventType), sourceValue);
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

async function autocompleteTemplate(interaction, subcommand, focusedName, deps) {
  const { templateService, warService } = deps;
  const focused = interaction.options.getFocused(true);
  const focusedText = String(focused?.value || '').toLowerCase();

  if (subcommand === 'create' && focusedName === 'evento_id') {
    const typeRaw = interaction.options.getString('tipo');
    const type = typeRaw ? normalizeEventType(typeRaw) : null;
    const options = buildTemplateSourceOptions(interaction, warService, type, focusedText);
    return await interaction.respond(options);
  }

  if (subcommand === 'update' && focusedName === 'id') {
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

  if (subcommand === 'update' && focusedName === 'evento_id') {
    const templateId = interaction.options.getString('id');
    if (!templateId) {
      return await interaction.respond([]);
    }

    const template = await templateService.getTemplateById(interaction.guildId, templateId);
    if (!template) {
      return await interaction.respond([]);
    }

    const options = buildTemplateSourceOptions(interaction, warService, normalizeEventType(template.eventType), focusedText);
    return await interaction.respond(options);
  }

  if ((subcommand === 'archive' || subcommand === 'restore') && focusedName === 'id') {
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

  return await interaction.respond([]);
}

module.exports = {
  buildTemplateTypeChoices,
  handleEventTemplate,
  autocompleteTemplate
};
