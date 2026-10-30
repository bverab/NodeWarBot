const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, asAdmin } = require('../support/interaction/fakes');

describe('replyOrEdit (C-7)', () => {
  let replyOrEdit;

  beforeEach(() => {
    resetSrcModules();
    ({ replyOrEdit } = requireSrc('src/utils/interactionReply'));
  });

  it('responde con reply efimero si la interaccion no se ha respondido', async () => {
    const interaction = createInteraction();

    await expect(replyOrEdit(interaction, 'fallo')).resolves.toBe(true);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'fallo', flags: 64 }));
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('usa editReply si la interaccion ya se difirio', async () => {
    const interaction = createInteraction({ deferred: true });

    await expect(replyOrEdit(interaction, 'fallo')).resolves.toBe(true);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'fallo' }));
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('usa followUp efimero si ya se respondio sin diferir', async () => {
    const interaction = createInteraction({ replied: true });

    await replyOrEdit(interaction, 'fallo');

    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: 'fallo', flags: 64 }));
  });

  it('no menciona a nadie en el mensaje de error', async () => {
    const interaction = createInteraction();

    await replyOrEdit(interaction, '@everyone');

    expect(interaction.reply.mock.calls[0][0].allowedMentions).toEqual({ parse: [] });
  });

  it('ignora interacciones vencidas (10062) y ya reconocidas (40060)', async () => {
    for (const code of [10062, 40060]) {
      const interaction = createInteraction();
      interaction.reply = vi.fn(async () => {
        throw Object.assign(new Error('expired'), { code });
      });
      await expect(replyOrEdit(interaction, 'fallo')).resolves.toBe(false);
    }
  });
});

describe('los catch de los comandos usan editReply tras diferir (C-7)', () => {
  beforeEach(() => {
    resetSrcModules();
  });

  it('/eventadmin: un error despues de deferReply edita la respuesta con el mensaje de error', async () => {
    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => {
      throw new Error('boom');
    });
    const eventadmin = requireSrc('src/commands/eventadmin');
    const interaction = asAdmin(createInteraction({
      isAutocomplete: () => false,
      options: { getSubcommand: () => 'lock', getString: () => 'evt_1' }
    }));

    await eventadmin.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Error ejecutando eventadmin' }));
  });

  it('/event: un error despues de deferReply edita la respuesta con el mensaje de error', async () => {
    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => {
      throw new Error('boom');
    });
    const event = requireSrc('src/commands/event/index');
    const interaction = asAdmin(createInteraction({
      isAutocomplete: () => false,
      options: {
        getSubcommandGroup: () => null,
        getSubcommand: () => 'publish',
        getString: () => 'evt_1'
      }
    }));

    await event.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Error al ejecutar /event' }));
  });

  it('/fakeuser: un error despues de deferReply edita la respuesta con el mensaje de error', async () => {
    const warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => {
      throw new Error('boom');
    });
    warService.getLatestWarByChannelId = vi.fn(() => {
      throw new Error('boom');
    });
    const fakeuser = requireSrc('src/commands/fakeuser');
    const interaction = asAdmin(createInteraction({
      isAutocomplete: () => false,
      options: { getSubcommand: () => 'add', getString: () => 'x' }
    }));

    await fakeuser.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Error ejecutando comando' }));
  });
});
