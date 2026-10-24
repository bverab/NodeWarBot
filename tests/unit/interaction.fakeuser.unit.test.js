const { PermissionFlagsBits } = require('discord.js');
const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, asAdmin, collectReplies } = require('../support/interaction/fakes');

describe('/fakeuser restringido a administradores (C-3)', () => {
  let fakeuser;
  let warService;
  let latestWar;

  beforeEach(() => {
    resetSrcModules();
    latestWar = null;
    warService = requireSrc('src/services/warService');
    warService.loadWars = vi.fn(() => []);
    warService.getLatestWarByChannelId = vi.fn(() => latestWar);
    warService.updateWarByMessageId = vi.fn(async () => ({ war: null, result: null }));
    fakeuser = requireSrc('src/commands/fakeuser');
  });

  function buildCommandInteraction(subcommand = 'add') {
    return createInteraction({
      isAutocomplete: () => false,
      options: {
        getSubcommand: () => subcommand,
        getString: name => (name === 'nombre' ? 'Fake One' : 'Tank'),
        getFocused: () => ''
      },
      channel: { messages: { fetch: vi.fn(async () => new Map()) } }
    });
  }

  it('se registra solo para quienes tienen el permiso de Administrador', () => {
    const json = fakeuser.data.toJSON();
    expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.Administrator));
  });

  it.each(['add', 'remove'])('un no admin recibe rechazo en "%s" y no se modifica nada', async subcommand => {
    const interaction = buildCommandInteraction(subcommand);

    await fakeuser.execute(interaction);

    expect(collectReplies(interaction).join('\n')).toContain('Solo Admin');
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(warService.updateWarByMessageId).not.toHaveBeenCalled();
  });

  it('un no admin no obtiene sugerencias de autocompletado', async () => {
    latestWar = { id: 'w1', roles: [{ name: 'Tank', emoji: null }] };
    const interaction = buildCommandInteraction('add');
    interaction.isAutocomplete = () => true;
    interaction.respond = vi.fn(async () => null);

    await fakeuser.execute(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('un admin si obtiene sugerencias de autocompletado', async () => {
    latestWar = { id: 'w1', roles: [{ name: 'Tank', emoji: null }] };
    const interaction = asAdmin(buildCommandInteraction('add'));
    interaction.isAutocomplete = () => true;
    interaction.respond = vi.fn(async () => null);

    await fakeuser.execute(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([{ name: 'o Tank', value: 'Tank' }]);
  });

  it('un admin sigue pudiendo usar el comando', async () => {
    const interaction = asAdmin(buildCommandInteraction('add'));

    await fakeuser.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(collectReplies(interaction).join('\n')).not.toContain('Solo Admin');
  });
});
