async function notifyPromotion(interaction, war, promotedUser) {
  if (!promotedUser || promotedUser.isFake) return;

  const roleName = promotedUser.roleName || 'el rol seleccionado';
  const eventUrl = buildEventUrl(interaction, war);
  const eventTitle = war?.name || 'Evento';
  const text = eventUrl
    ? `Se libero un cupo para **${roleName}** en [${eventTitle}](${eventUrl}). Ya te movimos desde la waitlist.`
    : `Se libero un cupo para **${roleName}**. Ya te movimos desde la waitlist.`;
  const dmContent = `**Entraste!**\n${text}`;

  try {
    const user = await interaction.client.users.fetch(promotedUser.userId);
    await user.send(dmContent);
    return;
  } catch {
    console.log(`DM no disponible para ${promotedUser.userId}, usando fallback en canal`);
  }

  try {
    await interaction.channel.send({
      content: `<@${promotedUser.userId}> ${dmContent}`,
      allowedMentions: { parse: ['users'] }
    });
  } catch {
    console.log(`No se pudo enviar fallback en canal para ${promotedUser.userId}`);
  }
}

function buildEventUrl(interaction, war) {
  const guildId = interaction.guildId;
  const channelId = war?.channelId || interaction.channelId;
  const messageId = war?.messageId || interaction.message?.id;

  if (!guildId || !channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

module.exports = {
  notifyPromotion
};
