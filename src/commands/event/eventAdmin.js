async function handleScheduleView(interaction, deps) {
  const { warService, safeEphemeralReply } = deps;
  const allWars = warService.loadWarsFresh
    ? await warService.loadWarsFresh()
    : warService.loadWars();
  const wars = allWars
    .filter(war => war.channelId === interaction.channelId && (war.schedule?.enabled || isScheduledPublishPending(war)))
    .sort((a, b) => warScheduleSortKey(a) - warScheduleSortKey(b) || String(a.time).localeCompare(String(b.time)));

  if (!wars.length) {
    return await safeEphemeralReply(interaction, 'No hay programaciones activas en este canal.');
  }

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const lines = wars.slice(0, 20).map(war => {
    if (isScheduledPublishPending(war)) {
      return `- \`${war.id}\` | **${war.name}** | publish ${formatTimestamp(war.scheduledPublishAt)} | starts ${war.time || '?'} (${war.timezone}) | Scheduled publish pending`;
    }
    const mode = war.schedule?.mode === 'once' ? 'Unico' : 'Recurrente';
    return `- \`${war.id}\` | **${war.name}** | ${dayNames[war.dayOfWeek] || '?'} ${war.time} (${war.timezone}) | ${mode}`;
  });

  return await safeEphemeralReply(interaction, buildListReply(`Programaciones activas (${wars.length}):`, lines, wars.length));
}

function buildListReply(header, lines, totalCount, maxLength = 2000) {
  let content = header;
  let shown = 0;
  for (const line of lines) {
    const remaining = totalCount - shown - 1;
    const suffix = remaining > 0 ? `\n... y ${remaining} mas` : '';
    if (content.length + 1 + line.length + suffix.length > maxLength) break;
    content += `\n${line}`;
    shown += 1;
  }
  const hidden = totalCount - shown;
  return hidden > 0 ? `${content}\n... y ${hidden} mas` : content;
}

async function handleScheduleCancel(interaction, deps) {
  const { warService, safeEphemeralReply, getSanitizedOption, isAdminExecutor } = deps;
  if (!isAdminExecutor(interaction)) {
    return await safeEphemeralReply(interaction, 'Solo Admin puede gestionar eventos.');
  }

  const id = getSanitizedOption(interaction, 'id', { required: true, maxLength: 64 });
  const wars = warService.loadWars();
  const target = wars.find(war => war.id === id && war.channelId === interaction.channelId);
  if (!target) {
    return await safeEphemeralReply(
      interaction,
      `No se encontro programacion con id \`${id}\` en este canal.`
    );
  }

  await warService.deleteWarById(target.id);

  return await safeEphemeralReply(interaction, `Programacion cancelada: \`${id}\``);
}

async function autocompleteScheduleCancel(interaction, deps) {
  const { warService } = deps;
  const focused = interaction.options.getFocused(true);
  const focusedText = String(focused?.value || '').toLowerCase();
  // Se llama en cada tecla: lee la cache (el scheduler la sincroniza con la base en cada tick).
  const allWars = warService.loadWars();

  const wars = allWars
    .filter(war => war.channelId === interaction.channelId && (war.schedule?.enabled || isScheduledPublishPending(war)))
    .map(war => ({
      name: `${war.name} | ${war.time || formatTimestamp(war.scheduledPublishAt)} | ${war.id}`.slice(0, 100),
      value: String(war.id)
    }))
    .filter(item => item.name.toLowerCase().includes(focusedText) || item.value.toLowerCase().includes(focusedText))
    .slice(0, 25);

  return await interaction.respond(wars);
}

function isScheduledPublishPending(war) {
  return Boolean(war.autoPublishEnabled && war.scheduledPublishAt && !war.messageId);
}

function warScheduleSortKey(war) {
  if (isScheduledPublishPending(war)) {
    return Number(war.scheduledPublishAt);
  }
  return Number.isFinite(war.dayOfWeek) ? war.dayOfWeek * 24 * 60 : Number.MAX_SAFE_INTEGER;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'fecha no valida';
  }
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

module.exports = {
  handleScheduleView,
  handleScheduleCancel,
  autocompleteScheduleCancel
};
