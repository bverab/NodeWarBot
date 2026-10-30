const {
  selectConfirmedOption,
  selectFillerPromotion,
  listTitularIds,
  computeVoteTally,
  buildConfirmedMessage,
  buildVoteMessage,
  buildRandomsMessage,
  buildExtensionApprovedMessage
} = require('../../src/services/pveCloseReviewRules');

function enrollment(userId, extra = {}) {
  return { userId, displayName: extra.displayName || userId, isFake: Boolean(extra.isFake) };
}

function option(id, time, capacity, primaryIds = [], fillerIds = [], position = 0) {
  return {
    id,
    time,
    label: time,
    position,
    capacity,
    enrollments: primaryIds.map(userId => (typeof userId === 'string' ? enrollment(userId) : userId)),
    fillers: fillerIds.map(userId => enrollment(userId))
  };
}

describe('core: PvE close review — seleccion de horario', () => {
  it('elige el horario lleno mas temprano por hora, no por posicion', () => {
    const options = [
      option('late', '21:00', 2, ['a', 'b'], [], 0),
      option('early', '09:30', 1, ['c'], [], 1),
      option('open', '08:00', 3, ['d'], [], 2)
    ];
    expect(selectConfirmedOption(options).id).toBe('early');
  });

  it('a la misma hora gana la posicion menor', () => {
    const options = [option('second', '20:00', 1, ['a'], [], 2), option('first', '20:00', 1, ['b'], [], 1)];
    expect(selectConfirmedOption(options).id).toBe('first');
  });

  it('los fillers no cuentan para llenar y capacidad 0 nunca esta llena', () => {
    const options = [option('fillers', '20:00', 2, ['a'], ['f1', 'f2']), option('zero', '19:00', 0, [])];
    expect(selectConfirmedOption(options)).toBeNull();
  });

  it('los usuarios falsos ocupan cupo', () => {
    const options = [option('fake', '20:00', 2, ['a', enrollment('fake_1', { isFake: true })])];
    expect(selectConfirmedOption(options).id).toBe('fake');
  });
});

describe('core: PvE close review — titulares', () => {
  it('son los primarios unicos de todos los horarios, sin falsos ni suplentes', () => {
    const options = [
      option('a', '20:00', 3, ['u1', 'u2', enrollment('fake_x', { isFake: true })], ['filler_1']),
      option('b', '21:00', 3, ['u2', 'u3'], ['filler_2'])
    ];
    expect(listTitularIds(options)).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('core: PvE close review — conteo de votos', () => {
  const eligibleIds = ['u1', 'u2', 'u3', 'u4', 'u5'];
  const base = { eligibleIds, nowMs: 1000, voteEndsAt: 10_000 };

  it('decide en cuanto el si alcanza la mayoria', () => {
    const tally = computeVoteTally({ ...base, yesVoters: ['u1', 'u2', 'u3'], noVoters: [] });
    expect(tally).toMatchObject({ eligible: 5, majority: 3, yes: 3, no: 0, pending: 2, decision: 'approved' });
  });

  it('decide en cuanto el no alcanza la mayoria', () => {
    const tally = computeVoteTally({ ...base, yesVoters: ['u1'], noVoters: ['u2', 'u3', 'u4'] });
    expect(tally.decision).toBe('rejected');
  });

  it('sin mayoria y con votos pendientes sigue abierta', () => {
    const tally = computeVoteTally({ ...base, yesVoters: ['u1', 'u2'], noVoters: ['u3'] });
    expect(tally).toMatchObject({ yes: 2, no: 1, pending: 2, decision: null });
  });

  it('si todos votaron gana el si solo con mas votos; el empate se rechaza', () => {
    const four = { eligibleIds: ['u1', 'u2', 'u3', 'u4'], nowMs: 1000, voteEndsAt: 10_000 };
    expect(computeVoteTally({ ...four, yesVoters: ['u1', 'u2'], noVoters: ['u3', 'u4'] }).decision).toBe('rejected');
    const three = { eligibleIds: ['u1', 'u2', 'u3'], nowMs: 1000, voteEndsAt: 10_000 };
    expect(computeVoteTally({ ...three, yesVoters: ['u1'], noVoters: ['u2'] }).decision).toBeNull();
  });

  it('quien reacciona con ambos no cuenta para ninguno', () => {
    const tally = computeVoteTally({ ...base, yesVoters: ['u1', 'u2', 'u3'], noVoters: ['u3'] });
    expect(tally).toMatchObject({ yes: 2, no: 0, pending: 3, decision: null });
  });

  it('ignora a no titulares y a bots', () => {
    const tally = computeVoteTally({
      ...base,
      yesVoters: ['u1', 'outsider', { id: 'u2', bot: true }, { id: 'bot_user', bot: true }],
      noVoters: []
    });
    expect(tally).toMatchObject({ yes: 1, pending: 4, decision: null });
  });

  it('sin titulares se rechaza de inmediato', () => {
    expect(computeVoteTally({ eligibleIds: [], yesVoters: [], noVoters: [], nowMs: 1000, voteEndsAt: 10_000 }))
      .toMatchObject({ eligible: 0, decision: 'rejected' });
  });

  it('al vencer el plazo sin decision se rechaza', () => {
    const tally = computeVoteTally({ ...base, nowMs: 10_000, yesVoters: ['u1', 'u2'], noVoters: [] });
    expect(tally.decision).toBe('rejected');
    expect(tally.reason).toBe('timeout');
  });
});

describe('core: PvE close review — mensajes', () => {
  it('confirmado menciona solo a los titulares del horario y lista suplentes sin mencion', () => {
    const chosen = option('a', '20:00', 2, ['u1', enrollment('fake_1', { isFake: true })], ['f1']);
    chosen.fillers[0].displayName = 'Filler Uno';
    const message = buildConfirmedMessage({ customText: 'Texto @everyone', option: chosen });

    expect(message.content).toContain('Texto @​everyone');
    expect(message.content).toContain('✅ Horario confirmado: **20:00** (2/2)');
    expect(message.content).toContain('<@u1>');
    expect(message.content).not.toContain('<@fake_1>');
    expect(message.content).toContain('Suplentes: Filler Uno');
    expect(message.allowedMentions).toEqual({ parse: [], users: ['u1'] });
    expect(buildConfirmedMessage({ customText: '', option: option('b', '21:00', 1, ['u9']) }).content).not.toContain('Suplentes');
  });

  it('votacion: pregunta, regla de mayoria, plazo y conteo', () => {
    const message = buildVoteMessage({
      customText: '',
      titularIds: ['u1', 'u2', 'u3'],
      tally: { eligible: 3, majority: 2, yes: 1, no: 0, pending: 2 },
      voteEndsAt: Date.parse('2026-05-05T22:15:00.000Z')
    });
    expect(message.content).toContain('⏳ Ningun horario completo sus cupos al cierre.');
    expect(message.content).toContain('<@u1> <@u2> <@u3>');
    expect(message.content).toContain('¿Extendemos las inscripciones 1 hora? Reacciona ✅ para extender o ❌ para no extender.');
    expect(message.content).toContain(`Se decide con 2 de 3 titulares o al cerrar la votacion <t:${Date.parse('2026-05-05T22:15:00.000Z') / 1000}:R>.`);
    expect(message.content).toContain('Votos: ✅ 1 · ❌ 0 · sin votar 2');
    expect(message.allowedMentions).toEqual({ parse: [], users: ['u1', 'u2', 'u3'] });

    const closed = buildVoteMessage({
      customText: '',
      titularIds: ['u1'],
      tally: { eligible: 1, majority: 1, yes: 1, no: 0, pending: 0 },
      voteEndsAt: 0,
      result: 'approved'
    });
    expect(closed.content).toContain('Votacion cerrada: prorroga aprobada');
  });

  it('randoms y prorroga aprobada', () => {
    const afterExtension = buildRandomsMessage({ customText: '', titularIds: ['u1'], afterExtension: true });
    expect(afterExtension.content).toContain('⚠️ Ningun horario completo sus cupos tras la prorroga.');
    expect(afterExtension.content).toContain('Se sugiere completar los grupos eligiendo personas "randoms".');
    expect(buildRandomsMessage({ customText: '', titularIds: [], afterExtension: false }).content)
      .toContain('⚠️ Ningun horario completo sus cupos y no se aprobo la prorroga.');

    const closesAt = Date.parse('2026-05-05T23:15:00.000Z');
    expect(buildExtensionApprovedMessage({ yes: 2, eligible: 3, closesAt }).content)
      .toBe(`✅ Prorroga aprobada (2 de 3). Inscripciones abiertas hasta <t:${closesAt / 1000}:t>.`);
  });

  it('confirmado por fillers dice quienes entran; randoms lista los fillers anotados sin mencionarlos', () => {
    const chosen = option('a', '21:00', 3, ['u1', 'f1', 'f2'], ['f3']);
    const message = buildConfirmedMessage({
      customText: '',
      option: chosen,
      promoted: [enrollment('f1', { displayName: 'Filler Uno' }), enrollment('f2', { displayName: 'Filler Dos' })]
    });
    expect(message.content).toContain('✅ Horario confirmado: **21:00** (3/3)');
    expect(message.content).toContain('Entran desde fillers: Filler Uno, Filler Dos');
    expect(message.content).toContain('Suplentes: f3');
    expect(message.allowedMentions).toEqual({ parse: [], users: ['u1', 'f1', 'f2'] });

    const randoms = buildRandomsMessage({
      customText: '',
      titularIds: ['u1'],
      afterExtension: false,
      options: [option('a', '20:00', 5, ['u1'], ['f1']), option('b', '21:00', 5, [], ['f1', 'f2'])]
    });
    expect(randoms.content).toContain('Fillers anotados: f1, f2');
    expect(randoms.allowedMentions).toEqual({ parse: [], users: ['u1'] });
    expect(buildRandomsMessage({ customText: '', titularIds: [], afterExtension: false }).content).not.toContain('Fillers');
  });
});

describe('core: PvE close review — avance de fillers', () => {
  function filler(userId, joinedAt, extra = {}) {
    return { userId, displayName: userId, isFake: Boolean(extra.isFake), joinedAt };
  }

  it('elige el horario mas temprano que se completa con sus fillers y toma los que faltan por orden de llegada', () => {
    const early = option('early', '20:00', 4, ['a'], []);
    early.fillers = [filler('x', 5), filler('y', 6)];
    const late = option('late', '21:00', 3, ['b'], []);
    late.fillers = [filler('late_2', 20), filler('late_1', 10), filler('late_3', 30)];
    const later = option('later', '22:00', 2, [], []);
    later.fillers = [filler('z1', 1), filler('z2', 2)];

    const result = selectFillerPromotion([later, late, early]);

    expect(result.option.id).toBe('late');
    expect(result.fillers.map(entry => entry.userId)).toEqual(['late_1', 'late_2']);
  });

  it('cuenta a los fillers falsos, ignora horarios llenos o sin cupo y devuelve null si ninguno se completa', () => {
    const fake = option('fake', '20:00', 2, ['a'], []);
    fake.fillers = [filler('fake_1', 1, { isFake: true })];
    expect(selectFillerPromotion([fake]).fillers.map(entry => entry.userId)).toEqual(['fake_1']);

    const full = option('full', '19:00', 1, ['a'], ['f']);
    const noCapacity = option('zero', '19:30', 0, [], ['g']);
    const short = option('short', '20:00', 5, ['a'], ['f', 'g']);
    expect(selectFillerPromotion([full, noCapacity, short])).toBeNull();
    expect(selectFillerPromotion([])).toBeNull();
  });
});
