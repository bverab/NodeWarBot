const { normalizeEventType } = require('../../constants/eventTypes');

async function handleEventCreate(interaction, deps) {
  const {
    showCreateEventModal,
    templateService,
    safeEphemeralReply
  } = deps;

  const eventType = normalizeEventType(interaction.options.getString('tipo', true));
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
}

async function autocompleteCreateTemplate(interaction, deps) {
  const { templateService } = deps;
  const focused = interaction.options.getFocused(true);
  const focusedText = String(focused?.value || '').toLowerCase();
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

module.exports = {
  handleEventCreate,
  autocompleteCreateTemplate
};
