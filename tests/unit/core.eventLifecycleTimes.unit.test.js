const {
  deriveLifecycleForScheduledEvent,
  deriveLifecycleForExistingEvent,
  validateFutureLifecycle
} = require('../../src/utils/eventLifecycleTimes');

const MINUTE = 60 * 1000;
const NOW = new Date('2026-05-04T12:00:00-05:00'); // lunes en America/Bogota

function scheduled(publishTime, signupCloseTime, eventEndTime) {
  return deriveLifecycleForScheduledEvent({
    dayOfWeek: 2,
    publishTime,
    signupCloseTime,
    eventEndTime,
    timezone: 'America/Bogota',
    now: NOW
  });
}

describe('core: ciclos que cruzan medianoche', () => {
  it('publicacion 23:30, cierre 00:15 y fin 00:45 es valido y cierra al dia siguiente', () => {
    const lifecycle = scheduled('23:30', '00:15', '00:45');

    expect(validateFutureLifecycle(lifecycle, NOW).ok).toBe(true);
    expect(lifecycle.publishAt.toISOString()).toBe('2026-05-06T04:30:00.000Z');
    expect(lifecycle.signupCloseAt.getTime() - lifecycle.publishAt.getTime()).toBe(45 * MINUTE);
    expect(lifecycle.eventEndAt.getTime() - lifecycle.signupCloseAt.getTime()).toBe(30 * MINUTE);
  });

  it('el cierre a exactamente 6 h tras medianoche se desplaza; a mas de 6 h sigue siendo error', () => {
    const atLimit = scheduled('20:00', '02:00', '02:30');
    expect(validateFutureLifecycle(atLimit, NOW).ok).toBe(true);
    expect(atLimit.signupCloseAt.getTime() - atLimit.publishAt.getTime()).toBe(6 * 60 * MINUTE);

    const overLimit = scheduled('20:00', '02:01', '02:30');
    expect(validateFutureLifecycle(overLimit, NOW).ok).toBe(false);
  });

  it('publicar 20:00 y cerrar 08:00 sigue siendo un error de validacion', () => {
    const lifecycle = scheduled('20:00', '08:00', '09:00');
    const validation = validateFutureLifecycle(lifecycle, NOW);

    expect(validation.ok).toBe(false);
    expect(validation.message).toBe('Publish Time debe ser menor que Signup Close Time.');
  });

  it('un ciclo normal no cambia', () => {
    const lifecycle = scheduled('20:00', '21:00', '21:30');

    expect(validateFutureLifecycle(lifecycle, NOW).ok).toBe(true);
    expect(lifecycle.publishAt.toISOString()).toBe('2026-05-06T01:00:00.000Z');
    expect(lifecycle.signupCloseAt.toISOString()).toBe('2026-05-06T02:00:00.000Z');
    expect(lifecycle.eventEndAt.toISOString()).toBe('2026-05-06T02:30:00.000Z');
  });

  it('tambien aplica a eventos existentes', () => {
    const lifecycle = deriveLifecycleForExistingEvent({
      event: { expiresAt: Date.parse('2026-05-05T12:00:00-05:00') },
      publishTime: '23:30',
      signupCloseTime: '00:15',
      eventEndTime: '00:45',
      timezone: 'America/Bogota',
      now: NOW
    });

    expect(validateFutureLifecycle(lifecycle, NOW).ok).toBe(true);
    expect(lifecycle.signupCloseAt.getTime() - lifecycle.publishAt.getTime()).toBe(45 * MINUTE);
  });
});
