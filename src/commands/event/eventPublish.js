async function handleEventPublish(interaction, deps) {
  const {
    isAdminExecutor,
    safeEphemeralReply,
    resolveTargetWar,
    publishOrRefreshWar,
    warService,
    safeMessageContent,
    getSanitizedOption
  } = deps;

  if (!isAdminExecutor(interaction)) {
    return await safeEphemeralReply(interaction, 'Solo Admin puede gestionar eventos.');
  }

  await interaction.deferReply({ flags: 64 });
  const explicitId = getSanitizedOption(interaction, 'id', { maxLength: 64, allowEmpty: true });
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
  await interaction.editReply(safeMessageContent(
    `Publicacion forzada completada (${scopeLabel}).\nPublicados: ${published}\nActualizados: ${updated}\nFallidos: ${failed}`
  ));
}

async function autocompletePublishEventId(interaction, deps) {
  const { warService } = deps;
  const focused = interaction.options.getFocused(true);
  const focusedText = String(focused?.value || '').toLowerCase();
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

module.exports = {
  handleEventPublish,
  autocompletePublishEventId
};
