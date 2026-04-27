async function handleEventEdit(interaction, deps) {
  const { isAdminExecutor, safeEphemeralReply, warService, buildEventSelectorPayload } = deps;
  if (!isAdminExecutor(interaction)) {
    return await safeEphemeralReply(interaction, 'Solo Admin puede gestionar eventos.');
  }

  const wars = warService.loadWars().filter(war => war.channelId === interaction.channelId);
  const payload = buildEventSelectorPayload(wars);
  await interaction.reply({ flags: 64, ...payload });
}

module.exports = {
  handleEventEdit
};
