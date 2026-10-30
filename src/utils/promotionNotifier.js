const { buildFillerPromotionText } = require('../services/pveCloseReviewRules');

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
      allowedMentions: { parse: [], users: [String(promotedUser.userId)] }
    });
  } catch {
    console.log(`No se pudo enviar fallback en canal para ${promotedUser.userId}`);
  }
}

// Fillers que entraron a un horario al cierre (sin hilo de resumen): DM a cada uno; a quienes no
// aceptan DMs se les menciona en un solo mensaje en el canal del evento.
async function notifyFillerPromotions({ client, war, option, promoted = [] }) {
  const realUsers = promoted.filter(entry => entry?.userId && !entry.isFake);
  if (!client || realUsers.length === 0) return;

  const eventUrl = war?.guildId && war?.channelId && war?.messageId
    ? `https://discord.com/channels/${war.guildId}/${war.channelId}/${war.messageId}`
    : null;
  const text = buildFillerPromotionText({ eventName: war?.name, option, eventUrl });
  const undelivered = [];
  for (const entry of realUsers) {
    try {
      const user = await client.users.fetch(String(entry.userId));
      await user.send({ content: text, allowedMentions: { parse: [] } });
    } catch {
      undelivered.push(String(entry.userId));
    }
  }
  if (undelivered.length === 0) return;

  try {
    const channel = await client.channels.fetch(String(war.channelId));
    await channel.send({
      content: `${undelivered.map(userId => `<@${userId}>`).join(' ')} ${text}`,
      allowedMentions: { parse: [], users: undelivered }
    });
  } catch {
    console.log(`No se pudo avisar en el canal a los fillers promovidos de ${war?.id}`);
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
  notifyPromotion,
  notifyFillerPromotions
};
