async function handleScheduleView(interaction, deps) {
  const { warService, safeEphemeralReply } = deps;
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

async function handleScheduleCancel(interaction, deps) {
  const { warService, safeEphemeralReply, getSanitizedOption } = deps;
  const id = getSanitizedOption(interaction, 'id', { required: true, maxLength: 64 });
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

async function autocompleteScheduleCancel(interaction, deps) {
  const { warService } = deps;
  const focused = interaction.options.getFocused(true);
  const focusedText = String(focused?.value || '').toLowerCase();

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

module.exports = {
  handleScheduleView,
  handleScheduleCancel,
  autocompleteScheduleCancel
};
