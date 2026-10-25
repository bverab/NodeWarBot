// Reglas puras de la revision de cierre PvE: eleccion de horario, titulares, votacion de prorroga y
// textos de los mensajes. Sin Discord ni base de datos (se testean por separado).
const { sanitizeDisplayText, safeMessageContent, neutralizeMassMentions, DISCORD_LIMITS } = require('../utils/textSafety');

const VOTE_YES = '✅';
const VOTE_NO = '❌';
const VOTE_DURATION_MS = 15 * 60 * 1000;
const EXTENSION_MS = 60 * 60 * 1000;

function timeToMinutes(time) {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

function primaryEnrollments(option) {
  return Array.isArray(option?.enrollments) ? option.enrollments : [];
}

function isOptionFull(option) {
  const capacity = Number(option?.capacity);
  return Number.isFinite(capacity) && capacity > 0 && primaryEnrollments(option).length >= capacity;
}

// El horario lleno mas temprano (HH:mm); a igual hora, la posicion menor. Los fillers no cuentan.
function selectConfirmedOption(options = []) {
  const sorted = [...(Array.isArray(options) ? options : [])].sort((a, b) =>
    (timeToMinutes(a.time) - timeToMinutes(b.time)) || ((a.position ?? 0) - (b.position ?? 0))
  );
  return sorted.find(isOptionFull) || null;
}

// Titulares: inscritos primarios reales (los usuarios falsos no se pueden mencionar ni votan).
function listOptionTitularIds(option) {
  return Array.from(new Set(
    primaryEnrollments(option).filter(entry => entry?.userId && !entry.isFake).map(entry => String(entry.userId))
  ));
}

function listTitularIds(options = []) {
  return Array.from(new Set((Array.isArray(options) ? options : []).flatMap(listOptionTitularIds)));
}

function toVoterIds(voters = []) {
  return (Array.isArray(voters) ? voters : [])
    .filter(voter => voter && !(typeof voter === 'object' && voter.bot))
    .map(voter => String(typeof voter === 'object' ? voter.id : voter));
}

// Cuenta solo a titulares; quien marco ✅ y ❌ no cuenta para ninguno. Se decide con mayoria absoluta,
// cuando ya votaron todos (empate = rechazo) o al vencer el plazo (rechazo).
function computeVoteTally({ eligibleIds = [], yesVoters = [], noVoters = [], nowMs = Date.now(), voteEndsAt = null }) {
  const eligible = new Set(eligibleIds.map(String));
  const yes = new Set(toVoterIds(yesVoters).filter(id => eligible.has(id)));
  const no = new Set(toVoterIds(noVoters).filter(id => eligible.has(id)));
  for (const id of Array.from(yes)) {
    if (no.has(id)) {
      yes.delete(id);
      no.delete(id);
    }
  }

  const total = eligible.size;
  const majority = Math.floor(total / 2) + 1;
  const pending = total - yes.size - no.size;
  let decision = null;
  let reason = null;
  if (total === 0) {
    decision = 'rejected';
    reason = 'no_eligible';
  } else if (yes.size >= majority) {
    decision = 'approved';
    reason = 'majority';
  } else if (no.size >= majority) {
    decision = 'rejected';
    reason = 'majority';
  } else if (pending === 0) {
    decision = yes.size > no.size ? 'approved' : 'rejected';
    reason = 'all_voted';
  } else if (Number.isFinite(voteEndsAt) && nowMs >= voteEndsAt) {
    decision = 'rejected';
    reason = 'timeout';
  }

  return { eligible: total, majority, yes: yes.size, no: no.size, pending, decision, reason };
}

function mentionLine(userIds) {
  return userIds.length > 0 ? userIds.map(userId => `<@${userId}>`).join(' ') : null;
}

// El texto personalizado del recap va arriba; si no cabe junto al resto, se recorta el texto.
function composeContent(customText, lines) {
  const body = lines.filter(line => typeof line === 'string' && line.length > 0).join('\n');
  const text = neutralizeMassMentions(String(customText || '').trim());
  const room = DISCORD_LIMITS.messageContent - body.length - 2;
  const clipped = text && room > 0 ? text.slice(0, room) : '';
  return safeMessageContent(clipped ? `${clipped}\n\n${body}` : body, body);
}

function optionLabel(option) {
  return sanitizeDisplayText(option?.label || option?.time, { maxLength: 60, fallback: 'Horario' });
}

function buildConfirmedMessage({ customText, option }) {
  const titularIds = listOptionTitularIds(option);
  const substitutes = (Array.isArray(option?.fillers) ? option.fillers : [])
    .map(entry => sanitizeDisplayText(entry.displayName, { maxLength: 64, fallback: 'Usuario' }));
  return {
    content: composeContent(customText, [
      `✅ Horario confirmado: **${optionLabel(option)}** (${primaryEnrollments(option).length}/${option.capacity})`,
      mentionLine(titularIds),
      substitutes.length > 0 ? `Suplentes: ${substitutes.join(', ')}` : null
    ]),
    allowedMentions: { parse: [], users: titularIds }
  };
}

function buildTallyLine(tally) {
  return `Votos: ${VOTE_YES} ${tally.yes} · ${VOTE_NO} ${tally.no} · sin votar ${tally.pending}`;
}

function buildVoteMessage({ customText, titularIds, tally, voteEndsAt, result = null }) {
  const closedLine = result
    ? `Votacion cerrada: prorroga ${result === 'approved' ? 'aprobada' : 'rechazada'}`
    : null;
  return {
    content: composeContent(customText, [
      '⏳ Ningun horario completo sus cupos al cierre.',
      mentionLine(titularIds),
      `¿Extendemos las inscripciones 1 hora? Reacciona ${VOTE_YES} para extender o ${VOTE_NO} para no extender.`,
      `Se decide con ${tally.majority} de ${tally.eligible} titulares o al cerrar la votacion <t:${Math.floor(voteEndsAt / 1000)}:R>.`,
      buildTallyLine(tally),
      closedLine
    ]),
    allowedMentions: { parse: [], users: titularIds }
  };
}

function buildRandomsMessage({ customText, titularIds, afterExtension }) {
  return {
    content: composeContent(customText, [
      `⚠️ Ningun horario completo sus cupos${afterExtension ? ' tras la prorroga.' : ' y no se aprobo la prorroga.'}`,
      mentionLine(titularIds),
      'Se sugiere completar los grupos eligiendo personas "randoms".'
    ]),
    allowedMentions: { parse: [], users: titularIds }
  };
}

function buildExtensionApprovedMessage({ yes, eligible, closesAt }) {
  return {
    content: `✅ Prorroga aprobada (${yes} de ${eligible}). Inscripciones abiertas hasta <t:${Math.floor(closesAt / 1000)}:t>.`,
    allowedMentions: { parse: [] }
  };
}

module.exports = {
  VOTE_YES,
  VOTE_NO,
  VOTE_DURATION_MS,
  EXTENSION_MS,
  selectConfirmedOption,
  listOptionTitularIds,
  listTitularIds,
  computeVoteTally,
  buildConfirmedMessage,
  buildVoteMessage,
  buildRandomsMessage,
  buildExtensionApprovedMessage
};
