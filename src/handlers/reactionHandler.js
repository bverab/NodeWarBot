// Reacciones ✅/❌ en mensajes del bot: hoy solo la votacion de prorroga de la revision de cierre PvE.
const { VOTE_YES, VOTE_NO } = require('../services/pveCloseReviewRules');
const pveCloseReviewService = require('../services/pveCloseReviewService');
const { logError } = require('../utils/appLogger');

async function resolvePartial(entity) {
  if (!entity?.partial || typeof entity.fetch !== 'function') return entity;
  try {
    return await entity.fetch();
  } catch {
    // Una reaccion quitada puede no existir ya; los datos parciales (emoji, id del mensaje) bastan.
    return entity;
  }
}

async function handleMessageReaction(reaction, user) {
  try {
    const fullUser = await resolvePartial(user);
    if (fullUser?.bot) return;

    const fullReaction = await resolvePartial(reaction);
    const emoji = fullReaction?.emoji?.name;
    if (emoji !== VOTE_YES && emoji !== VOTE_NO) return;

    const message = await resolvePartial(fullReaction.message);
    if (!message?.id) return;

    await pveCloseReviewService.handleVoteReaction({
      client: fullReaction.client || message.client,
      messageId: message.id
    });
  } catch (error) {
    logError('Error procesando reaccion de votacion PvE', error, {
      action: 'pve_close_review_reaction',
      messageId: reaction?.message?.id || null,
      userId: user?.id || null
    });
  }
}

module.exports = {
  handleMessageReaction
};
