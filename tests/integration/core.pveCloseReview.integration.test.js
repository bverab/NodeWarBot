const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { createFakeDiscord, BOT_USER } = require('../helpers/fakeDiscord');
const warService = require('../../src/services/warService');
const pveService = require('../../src/services/pveService');
const pveCloseReviewService = require('../../src/services/pveCloseReviewService');
const { prisma } = require('../../src/db/client');
const { buildWar, buildWarRole } = require('../factories/warFactory');
const { handleMessageReaction } = require('../../src/handlers/reactionHandler');
const {
  initScheduler,
  stopScheduler,
  checkAndExecuteEvents
} = require('../../src/services/schedulerService');

setupIntegrationSuite();

const MIN = 60 * 1000;
const NOW = new Date('2026-05-05T22:00:00.000Z');
const CHANNEL_ID = 'pve_review_channel';
const CUSTOM_TEXT = 'Nos vemos en el boss';

async function createPveEvent(id, { options, enrollments = [], recapEnabled = true, closesAt = NOW.getTime() - MIN, expiresAt = NOW.getTime() + 60 * MIN }) {
  await warService.createWar(buildWar({
    id,
    eventType: 'pve',
    roles: [],
    waitlist: [],
    channelId: CHANNEL_ID,
    messageId: `${id}_msg`,
    timezone: 'UTC',
    createdAt: NOW.getTime() - 60 * MIN,
    closesAt,
    expiresAt,
    schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null },
    recap: { enabled: recapEnabled, minutesBeforeExpire: 0, messageText: CUSTOM_TEXT }
  }));
  await pveService.saveEventSlots(id, options.map((option, position) => ({ position, label: option.time, time: option.time, capacity: option.capacity })));
  const slots = await pveService.getEventSlots(id);
  for (const entry of enrollments) {
    await prisma.eventEnrollment.create({
      data: {
        eventId: id,
        optionId: slots[entry.option].id,
        userId: entry.userId,
        displayName: entry.name || entry.userId,
        isFake: Boolean(entry.isFake),
        enrollmentType: entry.filler ? 'FILLER' : 'PRIMARY'
      }
    });
  }
}

function setup(eventId) {
  const discord = createFakeDiscord();
  const channel = discord.createChannel(CHANNEL_ID);
  const eventMessage = discord.createMessage(channel, { content: '' }, `${eventId}_msg`);
  initScheduler(discord.client);
  return { discord, channel, eventMessage };
}

function threadOf(eventMessage) {
  return eventMessage.thread;
}

function embedFieldNames(message) {
  return (message.payload.embeds?.[0]?.data?.fields || []).map(field => String(field.name));
}

async function review(eventId) {
  return prisma.eventPveCloseReview.findUnique({ where: { eventId } });
}

async function react(discord, message, emoji, userId) {
  const user = { id: userId, bot: false };
  discord.addReaction(message, emoji, user);
  await handleMessageReaction(discord.reactionEvent(message, emoji), user);
}

// Ningun horario se llena, ni siquiera sumando su filler (21:00 queda 3/4).
const NONE_FULL = {
  options: [{ time: '20:00', capacity: 3 }, { time: '21:00', capacity: 4 }],
  enrollments: [
    { option: 0, userId: 'u1' },
    { option: 0, userId: 'u2' },
    { option: 1, userId: 'u3' },
    { option: 1, userId: 'filler_1', name: 'Filler Uno', filler: true },
    { option: 1, userId: 'fake_1', isFake: true }
  ]
};

describe('core: revision de cierre PvE', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  it('(1) con un horario lleno confirma ese horario, menciona solo a sus titulares y no vota', async () => {
    await createPveEvent('pve_full', {
      options: [{ time: '21:00', capacity: 1 }, { time: '20:00', capacity: 2 }],
      enrollments: [
        { option: 0, userId: 'late_user' },
        { option: 1, userId: 'u1' },
        { option: 1, userId: 'u2' },
        { option: 1, userId: 'filler_1', name: 'Filler Uno', filler: true }
      ]
    });
    const { eventMessage } = setup('pve_full');

    await checkAndExecuteEvents();

    const thread = threadOf(eventMessage);
    expect(thread.name.startsWith('Resumen ')).toBe(true);
    expect(thread.sent).toHaveLength(2);
    const [confirmed, copy] = thread.sent;
    expect(confirmed.content.startsWith(CUSTOM_TEXT)).toBe(true);
    expect(confirmed.content).toContain('✅ Horario confirmado: **20:00** (2/2)');
    expect(confirmed.content).toContain('Suplentes: Filler Uno');
    expect(confirmed.content).not.toContain('late_user');
    expect(confirmed.payload.allowedMentions).toEqual({ parse: [], users: ['u1', 'u2'] });
    expect(embedFieldNames(copy).some(name => name.includes('20:00'))).toBe(true);
    expect(embedFieldNames(copy).some(name => name.includes('21:00'))).toBe(false);
    expect(confirmed.reactionUsers.size).toBe(0);
    expect(await review('pve_full')).toMatchObject({ status: 'confirmed', messageId: 'pve_full_msg' });
    expect((await review('pve_full')).finalizedAt).not.toBeNull();
    expect(warService.getWarById('pve_full').recap.threadId).toBe(thread.id);

    await checkAndExecuteEvents();
    expect(thread.sent).toHaveLength(2);
  });

  it('(2) sin horarios llenos vota con los titulares (sin fillers) y el mensaje no expira mientras vota', async () => {
    await createPveEvent('pve_vote', { ...NONE_FULL, expiresAt: NOW.getTime() + 5 * MIN });
    const { eventMessage } = setup('pve_vote');

    await checkAndExecuteEvents();

    const thread = threadOf(eventMessage);
    expect(thread.sent).toHaveLength(1);
    const vote = thread.sent[0];
    expect(vote.content).toContain('⏳ Ningun horario completo sus cupos al cierre.');
    expect(vote.content).toContain('Se decide con 2 de 3 titulares');
    expect(vote.content).toContain('Votos: ✅ 0 · ❌ 0 · sin votar 3');
    expect(vote.payload.allowedMentions).toEqual({ parse: [], users: ['u1', 'u2', 'u3'] });
    expect(vote.content).not.toContain('filler_1');
    expect(Array.from(vote.reactionUsers.keys())).toEqual(['✅', '❌']);
    expect(vote.reactionUsers.get('✅').has(BOT_USER.id)).toBe(true);
    expect(await review('pve_vote')).toMatchObject({ status: 'pending', voteMessageId: vote.id });

    // expiresAt ya paso pero la votacion (15 min) sigue abierta: el mensaje no se borra.
    vi.setSystemTime(new Date(NOW.getTime() + 6 * MIN));
    await checkAndExecuteEvents();
    expect(await review('pve_vote')).toMatchObject({ status: 'pending' });
    expect(eventMessage.deleted).toBe(false);
    expect(warService.getWarById('pve_vote').messageId).toBe('pve_vote_msg');
  });

  it('(3) mayoria de ✅ reabre una hora; al volver a cerrar sin cupos llenos sugiere randoms', async () => {
    await createPveEvent('pve_extend', NONE_FULL);
    const { discord, eventMessage } = setup('pve_extend');
    await checkAndExecuteEvents();
    const thread = threadOf(eventMessage);
    const vote = thread.sent[0];
    const original = await prisma.event.findUnique({ where: { id: 'pve_extend' } });
    const editsBefore = eventMessage.edits.length;

    vi.setSystemTime(new Date(NOW.getTime() + 2 * MIN));
    await react(discord, vote, '✅', 'u1');
    expect(vote.content).toContain('Votos: ✅ 1 · ❌ 0 · sin votar 2');
    await react(discord, vote, '✅', 'u2');

    const decidedAt = NOW.getTime() + 2 * MIN;
    const row = await prisma.event.findUnique({ where: { id: 'pve_extend' } });
    expect(row.isClosed).toBe(false);
    expect(row.closesAt.getTime()).toBe(decidedAt + 60 * MIN);
    expect(row.expiresAt.getTime()).toBe(decidedAt + 60 * MIN + (original.expiresAt.getTime() - original.closesAt.getTime()));
    expect(eventMessage.edits.length).toBeGreaterThan(editsBefore);
    expect(vote.content).toContain('Votacion cerrada: prorroga aprobada');
    expect(thread.sent[1].content).toBe(`✅ Prorroga aprobada (2 de 3). Inscripciones abiertas hasta <t:${Math.floor((decidedAt + 60 * MIN) / 1000)}:t>.`);
    expect(await review('pve_extend')).toMatchObject({ status: 'approved', extensionUsed: true });

    vi.setSystemTime(new Date(decidedAt + 61 * MIN));
    await checkAndExecuteEvents();

    expect(thread.sent).toHaveLength(4);
    expect(thread.sent[2].content).toContain('⚠️ Ningun horario completo sus cupos tras la prorroga.');
    expect(thread.sent[2].content).toContain('Se sugiere completar los grupos eligiendo personas "randoms".');
    expect(thread.sent[2].payload.allowedMentions.users).toEqual(['u1', 'u2', 'u3']);
    expect(embedFieldNames(thread.sent[3]).filter(name => name.includes(':00'))).toHaveLength(2);
    const finished = await review('pve_extend');
    expect(finished.status).toBe('randoms');
    expect(finished.finalizedAt).not.toBeNull();
  });

  it('(4) mayoria de ❌ sugiere randoms sin prorroga', async () => {
    await createPveEvent('pve_reject', NONE_FULL);
    const { discord, eventMessage } = setup('pve_reject');
    await checkAndExecuteEvents();
    const thread = threadOf(eventMessage);

    await react(discord, thread.sent[0], '❌', 'u1');
    await react(discord, thread.sent[0], '❌', 'u3');

    expect(thread.sent[0].content).toContain('Votacion cerrada: prorroga rechazada');
    expect(thread.sent[1].content).toContain('⚠️ Ningun horario completo sus cupos y no se aprobo la prorroga.');
    expect(thread.sent).toHaveLength(3);
    expect(await review('pve_reject')).toMatchObject({ status: 'randoms' });
    expect((await prisma.event.findUnique({ where: { id: 'pve_reject' } })).isClosed).toBe(true);
  });

  it('(5) a los 15 minutos sin decision sugiere randoms', async () => {
    await createPveEvent('pve_timeout', NONE_FULL);
    const { discord, eventMessage } = setup('pve_timeout');
    await checkAndExecuteEvents();
    const thread = threadOf(eventMessage);
    await react(discord, thread.sent[0], '✅', 'u1');

    vi.setSystemTime(new Date(NOW.getTime() + 14 * MIN));
    await checkAndExecuteEvents();
    expect(thread.sent).toHaveLength(1);

    vi.setSystemTime(new Date(NOW.getTime() + 15 * MIN + 1000));
    await checkAndExecuteEvents();
    expect(thread.sent[1].content).toContain('y no se aprobo la prorroga.');
    expect(await review('pve_timeout')).toMatchObject({ status: 'randoms' });
  });

  it('(6) si todos votaron y empatan se rechaza', async () => {
    await createPveEvent('pve_tie', {
      options: [{ time: '20:00', capacity: 3 }],
      enrollments: [{ option: 0, userId: 'u1' }, { option: 0, userId: 'u2' }]
    });
    const { discord, eventMessage } = setup('pve_tie');
    await checkAndExecuteEvents();
    const thread = threadOf(eventMessage);

    await react(discord, thread.sent[0], '✅', 'u1');
    expect(thread.sent).toHaveLength(1);
    await react(discord, thread.sent[0], '❌', 'u2');

    expect(thread.sent[1].content).toContain('y no se aprobo la prorroga.');
    expect(await review('pve_tie')).toMatchObject({ status: 'randoms' });
  });

  it('(7) tras un reinicio la votacion pendiente se decide en un tick leyendo las reacciones', async () => {
    await createPveEvent('pve_restart', NONE_FULL);
    const { discord, eventMessage } = setup('pve_restart');
    await checkAndExecuteEvents();
    const thread = threadOf(eventMessage);
    stopScheduler();

    discord.addReaction(thread.sent[0], '✅', { id: 'u1', bot: false });
    discord.addReaction(thread.sent[0], '✅', { id: 'u3', bot: false });
    vi.setSystemTime(new Date(NOW.getTime() + 5 * MIN));
    initScheduler(discord.client);
    await checkAndExecuteEvents();

    expect(await review('pve_restart')).toMatchObject({ status: 'approved', extensionUsed: true });
    expect((await prisma.event.findUnique({ where: { id: 'pve_restart' } })).isClosed).toBe(false);
  });

  it('(8) una ocurrencia nueva (otro messageId) empieza la revision de cero', async () => {
    await createPveEvent('pve_new_occurrence', {
      options: [{ time: '20:00', capacity: 1 }],
      enrollments: [{ option: 0, userId: 'u1' }]
    });
    await prisma.eventPveCloseReview.create({
      data: { eventId: 'pve_new_occurrence', messageId: 'last_week_msg', status: 'randoms', extensionUsed: true, finalizedAt: new Date(NOW.getTime() - 7 * 24 * 60 * MIN) }
    });
    const { eventMessage } = setup('pve_new_occurrence');

    await checkAndExecuteEvents();

    const thread = threadOf(eventMessage);
    expect(thread.sent[0].content).toContain('✅ Horario confirmado: **20:00** (1/1)');
    expect(await review('pve_new_occurrence')).toMatchObject({ messageId: 'pve_new_occurrence_msg', status: 'confirmed', extensionUsed: false });
  });

  it('(9) War con recap y PvE sin recap mantienen el comportamiento de siempre', async () => {
    await createPveEvent('pve_no_recap', { ...NONE_FULL, recapEnabled: false });
    await warService.createWar(buildWar({
      id: 'war_with_recap',
      channelId: CHANNEL_ID,
      messageId: 'war_with_recap_msg',
      roles: [buildWarRole({ name: 'Flex', max: 5, users: [{ userId: 'w1', displayName: 'W1' }] })],
      createdAt: NOW.getTime() - 60 * MIN,
      closesAt: NOW.getTime() - MIN,
      expiresAt: NOW.getTime() + 10 * MIN,
      schedule: { enabled: false, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null },
      recap: { enabled: true, minutesBeforeExpire: 15, messageText: 'Resumen war' }
    }));
    const { discord, eventMessage } = setup('pve_no_recap');
    const warMessage = discord.createMessage(discord.channels.get(CHANNEL_ID), { content: '' }, 'war_with_recap_msg');

    await checkAndExecuteEvents();

    // Sin recap no hay hilo ni votacion; solo queda registrado que ningun horario se completo.
    expect(eventMessage.thread).toBeNull();
    expect(await review('pve_no_recap')).toMatchObject({ status: 'unfilled', threadId: null });
    expect(discord.dms.size).toBe(0);
    expect(warMessage.thread.sent[0].content).toBe('Resumen war\n\n<@w1>');
    expect(warMessage.thread.sent).toHaveLength(2);
    expect(await review('war_with_recap')).toBeNull();
  });

  // 20:00 (3 cupos) solo tiene 1 titular y 1 filler; 21:00 (3 cupos) se completa con 2 de sus 3 fillers.
  const FILLERS_COMPLETE = {
    options: [{ time: '21:00', capacity: 3 }, { time: '20:00', capacity: 3 }],
    enrollments: [
      { option: 1, userId: 'u1' },
      { option: 1, userId: 'early_filler', filler: true },
      { option: 0, userId: 'u2' },
      { option: 0, userId: 'filler_a', name: 'Filler A', filler: true },
      { option: 0, userId: 'filler_fake', name: 'Filler Fake', filler: true, isFake: true },
      { option: 0, userId: 'filler_c', name: 'Filler C', filler: true }
    ]
  };

  async function optionRoster(eventId, time) {
    const option = (await pveService.getEventPveView(warService.getWarById(eventId))).options.find(entry => entry.time === time);
    return { titulares: option.enrollments.map(entry => entry.userId), fillers: option.fillers.map(entry => entry.userId) };
  }

  it('(10) con recap y ningun horario lleno, los fillers completan el horario mas temprano posible y se confirma sin votar', async () => {
    await createPveEvent('pve_fillers_recap', FILLERS_COMPLETE);
    const { eventMessage } = setup('pve_fillers_recap');
    const editsBefore = eventMessage.edits.length;

    await checkAndExecuteEvents();

    expect(await optionRoster('pve_fillers_recap', '21:00')).toEqual({ titulares: ['u2', 'filler_a', 'filler_fake'], fillers: ['filler_c'] });
    expect(await optionRoster('pve_fillers_recap', '20:00')).toEqual({ titulares: ['u1'], fillers: ['early_filler'] });
    const thread = threadOf(eventMessage);
    expect(thread.sent).toHaveLength(2);
    const [confirmed] = thread.sent;
    expect(confirmed.content).toContain('✅ Horario confirmado: **21:00** (3/3)');
    expect(confirmed.content).toContain('Entran desde fillers: Filler A, Filler Fake');
    expect(confirmed.content).toContain('Suplentes: Filler C');
    expect(confirmed.payload.allowedMentions).toEqual({ parse: [], users: ['u2', 'filler_a'] });
    expect(eventMessage.edits.length).toBeGreaterThan(editsBefore);
    expect(await review('pve_fillers_recap')).toMatchObject({ status: 'confirmed' });
  });

  it('(11) sin recap los fillers tambien avanzan: se actualiza el mensaje y se avisa por DM (o en el canal si los DM estan cerrados)', async () => {
    await createPveEvent('pve_fillers_no_recap', { ...FILLERS_COMPLETE, recapEnabled: false });
    const { discord, channel, eventMessage } = setup('pve_fillers_no_recap');
    discord.dmBlocked.add('filler_a');
    const editsBefore = eventMessage.edits.length;

    await checkAndExecuteEvents();

    expect(await optionRoster('pve_fillers_no_recap', '21:00')).toEqual({ titulares: ['u2', 'filler_a', 'filler_fake'], fillers: ['filler_c'] });
    expect(eventMessage.thread).toBeNull();
    expect(eventMessage.edits.length).toBeGreaterThan(editsBefore);
    expect(discord.dms.size).toBe(0);
    const fallback = channel.sent.filter(message => message.id !== eventMessage.id);
    expect(fallback).toHaveLength(1);
    expect(fallback[0].content).toContain('<@filler_a>');
    expect(fallback[0].content).toContain('21:00');
    expect(fallback[0].payload.allowedMentions).toEqual({ parse: [], users: ['filler_a'] });
    expect(await review('pve_fillers_no_recap')).toMatchObject({ status: 'confirmed', threadId: null });

    // Ya decidido: otro tick no vuelve a promover ni a avisar.
    await checkAndExecuteEvents();
    expect(channel.sent.filter(message => message.id !== eventMessage.id)).toHaveLength(1);
  });

  it('(12) sin recap el aviso a quien entra desde fillers va por DM', async () => {
    await createPveEvent('pve_fillers_dm', { ...FILLERS_COMPLETE, recapEnabled: false });
    const { discord, channel, eventMessage } = setup('pve_fillers_dm');

    await checkAndExecuteEvents();

    expect(Array.from(discord.dms.keys())).toEqual(['filler_a']);
    expect(discord.dms.get('filler_a')[0].content).toContain('21:00');
    expect(channel.sent.filter(message => message.id !== eventMessage.id)).toHaveLength(0);
  });

  it('(13) si ni con fillers se completa un horario, la sugerencia de randoms lista a los fillers', async () => {
    await createPveEvent('pve_fillers_randoms', NONE_FULL);
    const { discord, eventMessage } = setup('pve_fillers_randoms');
    await checkAndExecuteEvents();
    const thread = threadOf(eventMessage);

    await react(discord, thread.sent[0], '❌', 'u1');
    await react(discord, thread.sent[0], '❌', 'u3');

    expect(thread.sent[1].content).toContain('Fillers anotados: Filler Uno');
    expect(thread.sent[1].payload.allowedMentions.users).toEqual(['u1', 'u2', 'u3']);
    expect(await optionRoster('pve_fillers_randoms', '21:00')).toEqual({ titulares: ['u3', 'fake_1'], fillers: ['filler_1'] });
  });

  async function reopen(eventId, closesAt, expiresAt) {
    await warService.updateWarById(eventId, fresh => {
      fresh.isClosed = false;
      fresh.closesAt = closesAt;
      fresh.expiresAt = expiresAt;
    });
  }

  async function addFiller(eventId, time, userId) {
    const option = (await pveService.getEventSlots(eventId)).find(entry => entry.time === time);
    await prisma.eventEnrollment.create({
      data: { eventId, optionId: option.id, userId, displayName: userId, enrollmentType: 'FILLER' }
    });
  }

  async function cancel(eventId) {
    await warService.updateWarById(eventId, fresh => {
      fresh.isClosed = true;
    });
    await pveCloseReviewService.cancelCloseReview(warService.getWarById(eventId));
  }

  it('(14) sin recap, reactivar el evento y volver a cerrar decide de nuevo: los fillers avanzan', async () => {
    await createPveEvent('pve_reopen', {
      options: [{ time: '20:00', capacity: 2 }],
      enrollments: [{ option: 0, userId: 'f1', filler: true }],
      recapEnabled: false
    });
    const { discord } = setup('pve_reopen');
    await checkAndExecuteEvents();
    expect(await review('pve_reopen')).toMatchObject({ status: 'unfilled' });

    await reopen('pve_reopen', NOW.getTime() + 30 * MIN, NOW.getTime() + 90 * MIN);
    vi.setSystemTime(new Date(NOW.getTime() + MIN));
    await checkAndExecuteEvents();
    await addFiller('pve_reopen', '20:00', 'f2');

    vi.setSystemTime(new Date(NOW.getTime() + 31 * MIN));
    await checkAndExecuteEvents();

    expect(await optionRoster('pve_reopen', '20:00')).toEqual({ titulares: ['f1', 'f2'], fillers: [] });
    expect(await review('pve_reopen')).toMatchObject({ status: 'confirmed' });
    expect(Array.from(discord.dms.keys()).sort()).toEqual(['f1', 'f2']);
  });

  it('(15) con recap, reactivar tras los randoms y volver a cerrar decide de nuevo', async () => {
    await createPveEvent('pve_reopen_recap', {
      options: [{ time: '20:00', capacity: 2 }],
      enrollments: [{ option: 0, userId: 'u1' }]
    });
    const { discord, eventMessage } = setup('pve_reopen_recap');
    await checkAndExecuteEvents();
    const thread = threadOf(eventMessage);
    await react(discord, thread.sent[0], '❌', 'u1');
    expect(await review('pve_reopen_recap')).toMatchObject({ status: 'randoms' });

    await reopen('pve_reopen_recap', NOW.getTime() + 30 * MIN, NOW.getTime() + 90 * MIN);
    vi.setSystemTime(new Date(NOW.getTime() + MIN));
    await checkAndExecuteEvents();
    await addFiller('pve_reopen_recap', '20:00', 'f1');

    vi.setSystemTime(new Date(NOW.getTime() + 31 * MIN));
    await checkAndExecuteEvents();

    expect(await optionRoster('pve_reopen_recap', '20:00')).toEqual({ titulares: ['u1', 'f1'], fillers: [] });
    expect(await review('pve_reopen_recap')).toMatchObject({ status: 'confirmed' });
    expect(thread.sent.some(message => message.content.includes('Entran desde fillers: f1'))).toBe(true);
  });

  it('(16) una decision no se repite si nadie reabrio el evento', async () => {
    await createPveEvent('pve_no_reopen', {
      options: [{ time: '20:00', capacity: 2 }],
      enrollments: [{ option: 0, userId: 'f1', filler: true }],
      recapEnabled: false
    });
    setup('pve_no_reopen');
    await checkAndExecuteEvents();
    await addFiller('pve_no_reopen', '20:00', 'f2');

    await checkAndExecuteEvents();

    expect(await optionRoster('pve_no_reopen', '20:00')).toEqual({ titulares: [], fillers: ['f1', 'f2'] });
    expect(await review('pve_no_reopen')).toMatchObject({ status: 'unfilled' });
  });

  it('(17) con recap y sin poder crear el hilo, los fillers avanzan igual y se avisa por DM', async () => {
    await createPveEvent('pve_no_thread', FILLERS_COMPLETE);
    const { discord, eventMessage } = setup('pve_no_thread');
    eventMessage.startThread = async () => {
      throw new Error('Missing Permissions');
    };

    await checkAndExecuteEvents();
    await checkAndExecuteEvents();

    expect(await optionRoster('pve_no_thread', '21:00')).toEqual({ titulares: ['u2', 'filler_a', 'filler_fake'], fillers: ['filler_c'] });
    expect(discord.dms.get('filler_a')).toHaveLength(1);
    expect(await review('pve_no_thread')).toMatchObject({ status: 'confirmed', threadId: null });
  });

  it('(18) sin hilo y sin fillers que completen no decide: reintenta y vota cuando el hilo se puede crear', async () => {
    await createPveEvent('pve_thread_later', NONE_FULL);
    const { eventMessage } = setup('pve_thread_later');
    const startThread = eventMessage.startThread;
    eventMessage.startThread = async () => {
      throw new Error('Missing Permissions');
    };

    await checkAndExecuteEvents();
    expect((await review('pve_thread_later')).status).toBeNull();

    eventMessage.startThread = startThread;
    await checkAndExecuteEvents();
    expect(await review('pve_thread_later')).toMatchObject({ status: 'pending' });
  });

  it('(19) un evento cancelado no promueve fillers, no avisa ni abre hilo al llegar el cierre', async () => {
    await createPveEvent('pve_cancelled', {
      ...FILLERS_COMPLETE,
      recapEnabled: false,
      closesAt: NOW.getTime() + 10 * MIN
    });
    const { discord, eventMessage } = setup('pve_cancelled');
    await cancel('pve_cancelled');

    vi.setSystemTime(new Date(NOW.getTime() + 11 * MIN));
    await checkAndExecuteEvents();

    expect(await optionRoster('pve_cancelled', '21:00')).toEqual({ titulares: ['u2'], fillers: ['filler_a', 'filler_fake', 'filler_c'] });
    expect(discord.dms.size).toBe(0);
    expect(eventMessage.thread).toBeNull();
    expect(await review('pve_cancelled')).toMatchObject({ status: 'cancelled', messageId: 'pve_cancelled_msg' });
  });

  it('(20) cancelar con recap detiene la votacion: no reabre aunque luego haya mayoria', async () => {
    await createPveEvent('pve_cancel_vote', NONE_FULL);
    const { discord, eventMessage } = setup('pve_cancel_vote');
    await checkAndExecuteEvents();
    const vote = threadOf(eventMessage).sent[0];
    await cancel('pve_cancel_vote');

    await react(discord, vote, '✅', 'u1');
    await react(discord, vote, '✅', 'u2');
    await checkAndExecuteEvents();

    expect(await review('pve_cancel_vote')).toMatchObject({ status: 'cancelled' });
    expect((await prisma.event.findUnique({ where: { id: 'pve_cancel_vote' } })).isClosed).toBe(true);
  });

  it('(21) reactivar un evento cancelado vuelve a revisar el siguiente cierre', async () => {
    await createPveEvent('pve_cancel_reopen', { ...FILLERS_COMPLETE, recapEnabled: false, closesAt: NOW.getTime() + 10 * MIN });
    setup('pve_cancel_reopen');
    await cancel('pve_cancel_reopen');

    await reopen('pve_cancel_reopen', NOW.getTime() + 30 * MIN, NOW.getTime() + 90 * MIN);
    vi.setSystemTime(new Date(NOW.getTime() + MIN));
    await checkAndExecuteEvents();

    vi.setSystemTime(new Date(NOW.getTime() + 31 * MIN));
    await checkAndExecuteEvents();

    expect(await optionRoster('pve_cancel_reopen', '21:00')).toEqual({ titulares: ['u2', 'filler_a', 'filler_fake'], fillers: ['filler_c'] });
    expect(await review('pve_cancel_reopen')).toMatchObject({ status: 'confirmed' });
  });

  it('(23) si la web archivo el evento y la cache aun lo ve abierto, la cancelacion no se pierde', async () => {
    await createPveEvent('pve_archive_race', { ...FILLERS_COMPLETE, recapEnabled: false, closesAt: NOW.getTime() + 30 * MIN, expiresAt: NOW.getTime() + 90 * MIN });
    const { discord } = setup('pve_archive_race');
    const staleCopy = warService.getWarById('pve_archive_race');
    await prisma.event.update({ where: { id: 'pve_archive_race' }, data: { isClosed: true, closesAt: NOW, expiresAt: NOW } });
    await prisma.eventPveCloseReview.create({
      data: { eventId: 'pve_archive_race', messageId: 'pve_archive_race_msg', status: 'cancelled', finalizedAt: NOW }
    });

    await pveCloseReviewService.processCloseReview(discord.client, staleCopy, NOW.getTime());

    expect(await review('pve_archive_race')).toMatchObject({ status: 'cancelled' });
  });

  it('(24) reactivar con el cierre ya vencido no repite la decision', async () => {
    await createPveEvent('pve_late_reopen', {
      options: [{ time: '20:00', capacity: 1 }],
      enrollments: [{ option: 0, userId: 'u1' }]
    });
    const { discord, eventMessage } = setup('pve_late_reopen');
    await checkAndExecuteEvents();
    const thread = threadOf(eventMessage);
    expect(thread.sent).toHaveLength(2);

    // "Reactivar" despues de la foto del tick: la cache lo ve abierto, con closesAt en el pasado.
    await warService.updateWarById('pve_late_reopen', fresh => {
      fresh.isClosed = false;
    });
    await pveCloseReviewService.processCloseReview(discord.client, warService.getWarById('pve_late_reopen'), NOW.getTime());
    await checkAndExecuteEvents();

    expect(await review('pve_late_reopen')).toMatchObject({ status: 'confirmed' });
    expect(thread.sent).toHaveLength(2);
  });

  it('(22) apagar el recap durante la votacion no deja el evento detenido: la votacion vence y el mensaje expira', async () => {
    await createPveEvent('pve_recap_off', { ...NONE_FULL, expiresAt: NOW.getTime() + 5 * MIN });
    const { eventMessage } = setup('pve_recap_off');
    await checkAndExecuteEvents();
    expect(await review('pve_recap_off')).toMatchObject({ status: 'pending' });

    await warService.updateWarById('pve_recap_off', fresh => {
      fresh.recap.enabled = false;
    });
    vi.setSystemTime(new Date(NOW.getTime() + 16 * MIN));
    await checkAndExecuteEvents();

    expect(await review('pve_recap_off')).toMatchObject({ status: 'randoms' });
    expect(eventMessage.deleted).toBe(true);
    expect(warService.getWarById('pve_recap_off').messageId).toBeNull();
  });
});
