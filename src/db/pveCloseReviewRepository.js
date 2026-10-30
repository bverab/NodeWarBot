// Estado de la revision de cierre PvE (una fila por evento). Tabla propia fuera del agregado del
// evento: las escrituras completas del evento (updateWar) no la pisan.
const { prisma } = require('./client');

function toNumber(date) {
  if (!date) return null;
  const value = date instanceof Date ? date.getTime() : Number(date);
  return Number.isFinite(value) ? value : null;
}

function toDomain(row) {
  if (!row) return null;
  return {
    eventId: row.eventId,
    messageId: row.messageId,
    threadId: row.threadId || null,
    voteMessageId: row.voteMessageId || null,
    voteEndsAt: toNumber(row.voteEndsAt),
    status: row.status || null,
    extensionUsed: Boolean(row.extensionUsed),
    finalizedAt: toNumber(row.finalizedAt)
  };
}

function toData(patch = {}) {
  const data = { ...patch };
  for (const key of ['voteEndsAt', 'finalizedAt']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      data[key] = Number.isFinite(data[key]) ? new Date(data[key]) : null;
    }
  }
  return data;
}

async function getReview(eventId) {
  return toDomain(await prisma.eventPveCloseReview.findUnique({ where: { eventId: String(eventId) } }));
}

async function getReviewByVoteMessageId(voteMessageId) {
  return toDomain(await prisma.eventPveCloseReview.findFirst({ where: { voteMessageId: String(voteMessageId) } }));
}

// Estado limpio para la ocurrencia publicada en messageId (una republicacion semanal empieza de cero).
async function startReview(eventId, messageId) {
  const fresh = {
    messageId: String(messageId),
    threadId: null,
    voteMessageId: null,
    voteEndsAt: null,
    status: null,
    extensionUsed: false,
    finalizedAt: null
  };
  const row = await prisma.eventPveCloseReview.upsert({
    where: { eventId: String(eventId) },
    update: fresh,
    create: { eventId: String(eventId), ...fresh }
  });
  return toDomain(row);
}

// Evento cancelado: esta ocurrencia ya no se revisa, aunque su votacion siguiera abierta.
async function cancelReview(eventId, messageId, nowMs = Date.now()) {
  const cancelled = { messageId: String(messageId), status: 'cancelled', finalizedAt: new Date(nowMs) };
  const row = await prisma.eventPveCloseReview.upsert({
    where: { eventId: String(eventId) },
    update: cancelled,
    create: { eventId: String(eventId), ...cancelled }
  });
  return toDomain(row);
}

async function updateReview(eventId, patch) {
  return toDomain(await prisma.eventPveCloseReview.update({ where: { eventId: String(eventId) }, data: toData(patch) }));
}

// Cambia de estado solo si sigue en `fromStatus` (evita aplicar dos veces una misma decision).
async function transitionReview(eventId, fromStatus, patch) {
  const result = await prisma.eventPveCloseReview.updateMany({
    where: { eventId: String(eventId), status: fromStatus },
    data: toData(patch)
  });
  return result.count > 0;
}

module.exports = {
  getReview,
  getReviewByVoteMessageId,
  startReview,
  cancelReview,
  updateReview,
  transitionReview
};
