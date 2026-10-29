// Revision de cierre de eventos PvE. Al cerrar inscripciones, si ningun horario se lleno con titulares,
// los fillers completan el horario mas temprano posible. Con recap activado ademas publica en el hilo
// del evento el horario confirmado, o una votacion para extender 1 hora, o la sugerencia de completar
// con "randoms" (reemplaza al hilo de recap por tiempo); sin recap avisa por DM a quien entra.
// El estado vive en EventPveCloseReview; cada evento se procesa en serie (tick y reacciones).
const { normalizeEventType } = require('../constants/eventTypes');
const warService = require('./warService');
const pveService = require('./pveService');
const reviewRepository = require('../db/pveCloseReviewRepository');
const { updateEventDiscordMessage } = require('./discordEventSyncService');
const { buildPveReadOnlyPayload } = require('../utils/pveMessageBuilder');
const rules = require('./pveCloseReviewRules');
const { notifyFillerPromotions } = require('../utils/promotionNotifier');
const { logInfo, logWarn, logError } = require('../utils/appLogger');

const reviewLocks = new Map();

function withReviewLock(eventId, task) {
  const key = String(eventId);
  const previous = reviewLocks.get(key) || Promise.resolve();
  const next = previous.catch(() => null).then(task);
  reviewLocks.set(key, next);
  return next.finally(() => {
    if (reviewLocks.get(key) === next) reviewLocks.delete(key);
  });
}

function isPveEvent(war) {
  return normalizeEventType(war?.eventType) === 'pve';
}

// PvE con recap: la revision publica en el hilo y reemplaza al recap por tiempo.
function isPveCloseReviewEvent(war) {
  return isPveEvent(war) && Boolean(war?.recap?.enabled);
}

function isReadyForReview(war, nowMs) {
  return Boolean(war.messageId) && Boolean(war.isClosed) && Number.isFinite(war.closesAt) && nowMs >= war.closesAt;
}

async function fetchChannel(client, channelId) {
  if (!channelId || !client?.channels?.fetch) return null;
  return await client.channels.fetch(String(channelId)).catch(() => null);
}

// Reutiliza el hilo de esta ocurrencia (estado o recap.threadId) o lo crea sobre el mensaje del evento.
async function ensureReviewThread(client, war, review) {
  const knownId = review.threadId || war.recap?.threadId || null;
  const known = await fetchChannel(client, knownId);
  if (known?.send) {
    if (review.threadId !== known.id) await reviewRepository.updateReview(war.id, { threadId: known.id });
    return known;
  }

  const channel = await fetchChannel(client, war.channelId);
  const sourceMessage = channel?.messages?.fetch
    ? await channel.messages.fetch(war.messageId).catch(() => null)
    : null;
  if (!sourceMessage) {
    logWarn('No se encontro el mensaje del evento para la revision de cierre PvE', {
      action: 'pve_close_review_thread',
      eventId: war.id,
      channelId: war.channelId,
      messageId: war.messageId
    });
    return null;
  }

  const thread = sourceMessage.thread || await sourceMessage.startThread({
    name: `Resumen ${war.name}`.slice(0, 100),
    autoArchiveDuration: 1440,
    reason: `Resumen final programado para ${war.name}`
  }).catch(error => {
    logWarn('No se pudo crear el hilo de la revision de cierre PvE', {
      action: 'pve_close_review_thread',
      eventId: war.id,
      reason: error?.message || 'unknown'
    });
    return null;
  });
  if (!thread) return null;

  await reviewRepository.updateReview(war.id, { threadId: thread.id });
  await warService.updateWarById(war.id, fresh => {
    fresh.recap.threadId = thread.id;
  });
  return thread;
}

async function readVoters(message, emoji) {
  const reaction = message?.reactions?.resolve?.(emoji);
  if (!reaction?.users?.fetch) return [];
  const users = await reaction.users.fetch().catch(() => null);
  return users ? Array.from(users.values()).map(user => ({ id: String(user.id), bot: Boolean(user.bot) })) : [];
}

async function editIfChanged(message, payload) {
  if (!message?.edit || message.content === payload.content) return;
  await message.edit({ content: payload.content, allowedMentions: { parse: [] } }).catch(error => {
    logWarn('No se pudo actualizar el mensaje de votacion PvE', {
      action: 'pve_close_review_vote_edit',
      messageId: message.id,
      reason: error?.message || 'unknown'
    });
  });
}

async function postCopy(thread, war, view) {
  await thread.send(buildPveReadOnlyPayload({ ...war, isClosed: true }, view));
}

async function refreshEventMessage(client, war) {
  const result = await updateEventDiscordMessage({ client, event: war });
  if (!result.ok) {
    logWarn('No se pudo actualizar el mensaje del evento tras el avance de fillers', {
      action: 'pve_close_review_fillers',
      eventId: war.id,
      reason: result.errorMessage || result.status
    });
  }
}

// Sin horario lleno: los fillers del horario mas temprano que se completa pasan a titulares.
// Devuelve el horario ya completo y quienes entraron, o null si ningun horario se completa.
async function advanceFillers(client, war, view) {
  const candidate = rules.selectFillerPromotion(view.options);
  if (!candidate) return null;

  const result = await pveService.promoteFillers(war.id, candidate.option.id, candidate.fillers.map(entry => entry.userId));
  const promotedIds = new Set((result.promoted || []).map(String));
  if (promotedIds.size === 0) return null;

  const fresh = await pveService.getEventPveView(war);
  const option = fresh.options.find(entry => entry.id === candidate.option.id) || candidate.option;
  await refreshEventMessage(client, war);
  logInfo('Revision de cierre PvE: fillers completan un horario', {
    action: 'pve_close_review_fillers',
    eventId: war.id,
    optionId: option.id,
    promoted: promotedIds.size
  });
  return { option, view: fresh, promoted: candidate.fillers.filter(entry => promotedIds.has(String(entry.userId))) };
}

// Sin recap: solo el avance de fillers, con aviso por DM a quienes entran.
async function runFillerStep(client, war, nowMs) {
  const view = await pveService.getEventPveView(war);
  if (rules.selectConfirmedOption(view.options)) {
    await reviewRepository.updateReview(war.id, { status: 'confirmed', finalizedAt: nowMs });
    return;
  }

  const advance = await advanceFillers(client, war, view);
  // El estado se guarda antes de avisar: un fallo al avisar no repite la promocion ni los avisos.
  await reviewRepository.updateReview(war.id, { status: advance ? 'confirmed' : 'unfilled', finalizedAt: nowMs });
  if (advance) {
    await notifyFillerPromotions({ client, war, option: advance.option, promoted: advance.promoted });
  }
}

async function finishWithRandoms(client, war, review, { afterExtension, thread = null, view = null, nowMs = Date.now() }) {
  const target = thread || await ensureReviewThread(client, war, review);
  if (!target) return;
  const fullView = view || await pveService.getEventPveView(war);
  await target.send(rules.buildRandomsMessage({
    customText: war.recap?.messageText,
    titularIds: rules.listTitularIds(fullView.options),
    afterExtension,
    options: fullView.options
  }));
  await postCopy(target, war, fullView);
  await reviewRepository.updateReview(war.id, { status: 'randoms', finalizedAt: nowMs });
  logInfo('Revision de cierre PvE: sugerencia de randoms', { action: 'pve_close_review', eventId: war.id, afterExtension });
}

// Paso A: horario confirmado (lleno con titulares o completado con fillers), votacion de prorroga o randoms.
async function runCloseStep(client, war, review, nowMs) {
  const thread = await ensureReviewThread(client, war, review);
  if (!thread) return;

  let view = await pveService.getEventPveView(war);
  const customText = war.recap?.messageText;
  let chosen = rules.selectConfirmedOption(view.options);
  let promoted = [];
  if (!chosen) {
    const advance = await advanceFillers(client, war, view);
    if (advance) ({ option: chosen, view, promoted } = advance);
  }
  if (chosen) {
    await thread.send(rules.buildConfirmedMessage({ customText, option: chosen, promoted }));
    await postCopy(thread, war, { ...view, options: [chosen] });
    await reviewRepository.updateReview(war.id, { status: 'confirmed', finalizedAt: nowMs });
    logInfo('Revision de cierre PvE: horario confirmado', { action: 'pve_close_review', eventId: war.id, optionId: chosen.id });
    return;
  }

  const titularIds = rules.listTitularIds(view.options);
  if (review.extensionUsed || titularIds.length === 0) {
    await finishWithRandoms(client, war, review, { afterExtension: review.extensionUsed, thread, view, nowMs });
    return;
  }

  const voteEndsAt = nowMs + rules.VOTE_DURATION_MS;
  const tally = rules.computeVoteTally({ eligibleIds: titularIds, nowMs, voteEndsAt });
  const voteMessage = await thread.send(rules.buildVoteMessage({ customText, titularIds, tally, voteEndsAt }));
  await reviewRepository.updateReview(war.id, { status: 'pending', voteMessageId: voteMessage.id, voteEndsAt });
  for (const emoji of [rules.VOTE_YES, rules.VOTE_NO]) {
    try {
      await voteMessage.react(emoji);
    } catch (error) {
      // Sin permiso de agregar reacciones los titulares igual pueden reaccionar.
      logWarn('No se pudo agregar la reaccion de votacion PvE', {
        action: 'pve_close_review_vote_react',
        eventId: war.id,
        emoji,
        reason: error?.message || 'unknown'
      });
    }
  }
  logInfo('Revision de cierre PvE: votacion de prorroga abierta', { action: 'pve_close_review', eventId: war.id, eligible: titularIds.length });
}

async function applyExtension(client, war, thread, tally, nowMs) {
  const closesAt = nowMs + rules.EXTENSION_MS;
  const { war: reopened } = await warService.updateWarById(war.id, fresh => {
    const remaining = Math.max(0, fresh.expiresAt - fresh.closesAt);
    fresh.isClosed = false;
    fresh.closesAt = closesAt;
    fresh.expiresAt = closesAt + remaining;
  });
  if (reopened?.messageId) {
    const result = await updateEventDiscordMessage({ client, event: reopened });
    if (!result.ok) {
      logWarn('No se pudo reabrir el mensaje del evento tras la prorroga', {
        action: 'pve_close_review_extension',
        eventId: war.id,
        reason: result.errorMessage || result.status
      });
    }
  }
  if (thread) await thread.send(rules.buildExtensionApprovedMessage({ yes: tally.yes, eligible: tally.eligible, closesAt }));
  logInfo('Revision de cierre PvE: prorroga aprobada', { action: 'pve_close_review', eventId: war.id, closesAt });
}

async function evaluateVote(client, war, review, nowMs) {
  const thread = await fetchChannel(client, review.threadId);
  const voteMessage = thread?.messages?.fetch
    ? await thread.messages.fetch(review.voteMessageId).catch(() => null)
    : null;
  const view = await pveService.getEventPveView(war);
  const titularIds = rules.listTitularIds(view.options);
  const [yesVoters, noVoters] = voteMessage
    ? await Promise.all([readVoters(voteMessage, rules.VOTE_YES), readVoters(voteMessage, rules.VOTE_NO)])
    : [[], []];
  const tally = rules.computeVoteTally({ eligibleIds: titularIds, yesVoters, noVoters, nowMs, voteEndsAt: review.voteEndsAt });
  const customText = war.recap?.messageText;

  if (!tally.decision) {
    await editIfChanged(voteMessage, rules.buildVoteMessage({ customText, titularIds, tally, voteEndsAt: review.voteEndsAt }));
    return;
  }

  const approved = tally.decision === 'approved';
  const won = await reviewRepository.transitionReview(
    war.id,
    'pending',
    approved ? { status: 'approved', extensionUsed: true } : { status: 'rejected' }
  );
  if (!won) return;

  await editIfChanged(voteMessage, rules.buildVoteMessage({
    customText,
    titularIds,
    tally,
    voteEndsAt: review.voteEndsAt,
    result: approved ? 'approved' : 'rejected'
  }));
  if (approved) {
    await applyExtension(client, war, thread, tally, nowMs);
    return;
  }
  await finishWithRandoms(client, war, { ...review, status: 'rejected' }, { afterExtension: false, thread, view, nowMs });
}

// Desde el tick del scheduler, para todo PvE publicado. Devuelve si la votacion sigue abierta (el
// mensaje no debe expirar).
async function processCloseReview(client, war, nowMs = Date.now()) {
  if (!isPveEvent(war) || !war.messageId || !client) return { votePending: false };
  // Sin recap no hay votacion: antes del cierre no hay nada que revisar (evita consultas en cada tick).
  // Se mira la copia de la cache: el mismo tick pudo cerrar las inscripciones.
  const cached = warService.getWarById(war.id) || war;
  if (!isPveCloseReviewEvent(cached) && !isReadyForReview(cached, nowMs)) return { votePending: false };

  return await withReviewLock(war.id, async () => {
    const current = warService.getWarById(war.id) || war;
    if (!current.messageId) return { votePending: false };

    try {
      let review = await reviewRepository.getReview(current.id);
      // Otra ocurrencia (republicacion semanal): se empieza de cero.
      if (review && review.messageId !== current.messageId) review = null;

      if (!isPveCloseReviewEvent(current)) {
        // Sin recap: una sola decision por ocurrencia.
        if (isReadyForReview(current, nowMs) && (!review || review.status === null)) {
          if (!review) await reviewRepository.startReview(current.id, current.messageId);
          await runFillerStep(client, current, nowMs);
        }
      } else if (review?.status === 'pending') {
        await evaluateVote(client, current, review, nowMs);
      } else if (review?.status === 'rejected') {
        await finishWithRandoms(client, current, review, { afterExtension: false, nowMs });
      } else if (isReadyForReview(current, nowMs) && (!review || review.status === null || review.status === 'approved')) {
        // Sin revision aun, o prorroga aprobada y las inscripciones volvieron a cerrar.
        const started = review || await reviewRepository.startReview(current.id, current.messageId);
        await runCloseStep(client, current, started, nowMs);
      }
    } catch (error) {
      // Se reintenta en el siguiente tick; un fallo aqui no corta el resto del scheduler.
      logError('Error en la revision de cierre PvE', error, { action: 'pve_close_review', eventId: current.id });
    }

    const latest = await reviewRepository.getReview(current.id);
    return { votePending: Boolean(latest && latest.messageId === current.messageId && latest.status === 'pending') };
  });
}

// Desde los listeners de reacciones: reevalua la votacion de ese mensaje en tiempo real.
async function handleVoteReaction({ client, messageId }) {
  if (!messageId) return false;
  const review = await reviewRepository.getReviewByVoteMessageId(messageId);
  if (!review || review.status !== 'pending') return false;

  await withReviewLock(review.eventId, async () => {
    const war = warService.getWarById(review.eventId);
    const fresh = await reviewRepository.getReview(review.eventId);
    if (!war || !fresh || fresh.status !== 'pending') return;
    if (fresh.voteMessageId !== String(messageId) || fresh.messageId !== war.messageId) return;
    await evaluateVote(client, war, fresh, Date.now());
  });
  return true;
}

module.exports = {
  isPveEvent,
  isPveCloseReviewEvent,
  processCloseReview,
  handleVoteReaction
};
