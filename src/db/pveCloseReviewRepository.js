// Estado de la revision de cierre PvE (una fila por evento). Tabla propia fuera del agregado del
// evento: las escrituras completas del evento (updateWar) no la pisan.
const { prisma } = require('./client');

// Decision tomada para un cierre: no se repite salvo que el evento se reabra.
const DECIDED_STATUSES = ['confirmed', 'randoms', 'unfilled', 'cancelled'];

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

function cleanReview(messageId) {
  return {
    messageId: String(messageId),
    threadId: null,
    voteMessageId: null,
    voteEndsAt: null,
    status: null,
    extensionUsed: false,
    finalizedAt: null
  };
}

// Estado limpio para la ocurrencia publicada en messageId (una republicacion semanal empieza de cero).
async function startReview(eventId, messageId) {
  const fresh = cleanReview(messageId);
  const row = await prisma.eventPveCloseReview.upsert({
    where: { eventId: String(eventId) },
    update: fresh,
    create: { eventId: String(eventId), ...fresh }
  });
  return toDomain(row);
}

// Evento reabierto tras decidir: el proximo cierre se revisa de cero. Se comprueba contra la base y no
// contra la cache del bot (la web archiva por su cuenta), y solo con el cierre en el futuro: con el
// cierre vencido el scheduler vuelve a cerrarlo y la decision sigue valiendo. null si no se reinicio.
async function restartReopenedReview(eventId, messageId, nowMs = Date.now()) {
  const id = String(eventId);
  const message = String(messageId);
  return await prisma.$transaction(async tx => {
    const event = await tx.event.findUnique({
      where: { id },
      select: { isClosed: true, closesAt: true, messageId: true }
    });
    if (!event || event.isClosed || event.messageId !== message || event.closesAt.getTime() <= nowMs) return null;

    const restarted = await tx.eventPveCloseReview.updateMany({
      where: { eventId: id, messageId: message, status: { in: DECIDED_STATUSES } },
      data: cleanReview(message)
    });
    return restarted.count > 0 ? toDomain(await tx.eventPveCloseReview.findUnique({ where: { eventId: id } })) : null;
  });
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
  DECIDED_STATUSES,
  getReview,
  getReviewByVoteMessageId,
  startReview,
  restartReopenedReview,
  cancelReview,
  updateReview,
  transitionReview
};
