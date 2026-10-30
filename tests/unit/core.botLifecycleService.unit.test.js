describe('core: botLifecycleService', () => {
  function loadService() {
    const schedulerService = require('../../src/services/schedulerService');
    const persistence = require('../../src/db/init');
    const calls = [];
    let releaseTick;
    const tick = new Promise(resolve => {
      releaseTick = resolve;
    });

    vi.spyOn(schedulerService, 'stopScheduler').mockImplementation(() => calls.push('stopScheduler'));
    vi.spyOn(schedulerService, 'waitForSchedulerIdle').mockImplementation(async () => {
      calls.push('waitTick:start');
      await tick;
      calls.push('waitTick:end');
    });
    vi.spyOn(persistence, 'shutdownPersistence').mockImplementation(async () => calls.push('shutdownPersistence'));

    // Instancia nueva del servicio en cada test: shutdown() guarda su promesa a nivel de modulo.
    delete require.cache[require.resolve('../../src/services/botLifecycleService')];
    const service = require('../../src/services/botLifecycleService');
    return { service, calls, releaseTick, schedulerService, persistence };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shutdown detiene el scheduler, espera el tick en curso y luego cierra Discord y la base', async () => {
    const { service, calls, releaseTick } = loadService();
    const client = { destroy: vi.fn(async () => calls.push('client.destroy')) };

    const pending = service.shutdown({ client });
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(calls).toEqual(['stopScheduler', 'waitTick:start']);
    expect(client.destroy).not.toHaveBeenCalled();

    releaseTick();
    await pending;

    expect(calls).toEqual([
      'stopScheduler',
      'waitTick:start',
      'waitTick:end',
      'client.destroy',
      'shutdownPersistence'
    ]);
  });

  it('shutdown es idempotente y cierra la base aunque falle client.destroy', async () => {
    const { service, releaseTick, schedulerService, persistence } = loadService();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = { destroy: vi.fn(async () => { throw new Error('gateway caido'); }) };
    releaseTick();

    const first = service.shutdown({ client });
    const second = service.shutdown({ client });
    await Promise.all([first, second]);

    expect(second).toBe(first);
    expect(schedulerService.stopScheduler).toHaveBeenCalledTimes(1);
    expect(persistence.shutdownPersistence).toHaveBeenCalledTimes(1);
  });

  it('validateEnvironment exige TOKEN y DATABASE_URL con un mensaje claro', () => {
    const { service } = loadService();

    expect(() => service.validateEnvironment({ TOKEN: 'x', DATABASE_URL: 'file:./db' })).not.toThrow();
    expect(() => service.validateEnvironment({ TOKEN: ' ', DATABASE_URL: 'file:./db' })).toThrow('TOKEN');
    expect(() => service.validateEnvironment({})).toThrow('Faltan variables de entorno: TOKEN, DATABASE_URL');
  });

  describe('replyWithInteractionError', () => {
    function buildInteraction(overrides = {}) {
      return {
        replied: false,
        deferred: false,
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        reply: vi.fn(async () => null),
        editReply: vi.fn(async () => null),
        followUp: vi.fn(async () => null),
        ...overrides
      };
    }

    it('no responde autocompletes', async () => {
      const { service } = loadService();
      const interaction = buildInteraction({ isAutocomplete: () => true });

      await service.replyWithInteractionError(interaction);

      expect(interaction.reply).not.toHaveBeenCalled();
      expect(interaction.editReply).not.toHaveBeenCalled();
      expect(interaction.followUp).not.toHaveBeenCalled();
    });

    it('un comando diferido sin respuesta se completa con editReply', async () => {
      const { service } = loadService();
      const interaction = buildInteraction({ deferred: true });

      await service.replyWithInteractionError(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Error ejecutando el comando' }));
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('un componente diferido recibe un followUp efimero', async () => {
      const { service } = loadService();
      const interaction = buildInteraction({ deferred: true, isChatInputCommand: () => false });

      await service.replyWithInteractionError(interaction);

      expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
      expect(interaction.editReply).not.toHaveBeenCalled();
    });

    it('sin diferir responde con reply; si ya respondio no hace nada', async () => {
      const { service } = loadService();
      const fresh = buildInteraction();
      const replied = buildInteraction({ replied: true, deferred: true });

      await service.replyWithInteractionError(fresh);
      await service.replyWithInteractionError(replied);

      expect(fresh.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
      expect(replied.reply).not.toHaveBeenCalled();
      expect(replied.editReply).not.toHaveBeenCalled();
      expect(replied.followUp).not.toHaveBeenCalled();
    });
  });
});
