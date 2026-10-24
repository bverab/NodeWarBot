const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, collectReplies } = require('../support/interaction/fakes');

describe('/garmoth link y refresh: cooldown por usuario (C-13)', () => {
  let garmoth;
  let linkService;
  let profileService;

  beforeEach(() => {
    resetSrcModules();
    linkService = requireSrc('src/services/garmothLinkService');
    const stored = { discordUserId: 'user_1', guildId: 'guild_1', garmothProfileUrl: 'https://garmoth.com/character/Pepe' };
    linkService.getCharacterLink = vi.fn(() => stored);
    linkService.upsertCharacterLink = vi.fn(async () => stored);
    linkService.updateCharacterLink = vi.fn(async () => ({ ...stored, characterName: 'Pepe' }));
    linkService.removeCharacterLink = vi.fn(async () => true);
    profileService = requireSrc('src/services/garmothProfileService');
    profileService.refreshGarmothLink = vi.fn(async () => ({ ok: true, patch: { syncStatus: 'success' } }));
    garmoth = requireSrc('src/commands/garmoth');
  });

  function buildCommand(subcommand, userId = 'user_1') {
    return createInteraction({
      user: { id: userId, username: userId },
      inGuild: () => true,
      options: {
        getSubcommand: () => subcommand,
        getString: () => 'https://garmoth.com/character/Pepe'
      }
    });
  }

  it('un segundo refresh inmediato se rechaza con el tiempo de espera y no consulta Garmoth', async () => {
    const first = buildCommand('refresh');
    await garmoth.execute(first);
    expect(profileService.refreshGarmothLink).toHaveBeenCalledTimes(1);

    const second = buildCommand('refresh');
    await garmoth.execute(second);

    expect(profileService.refreshGarmothLink).toHaveBeenCalledTimes(1);
    expect(second.deferReply).not.toHaveBeenCalled();
    expect(collectReplies(second).join('\n')).toMatch(/Espera \d+s/);
  });

  it('link tras un refresh reciente tambien espera y no guarda nada', async () => {
    await garmoth.execute(buildCommand('refresh'));

    const link = buildCommand('link');
    await garmoth.execute(link);

    expect(linkService.upsertCharacterLink).not.toHaveBeenCalled();
    expect(profileService.refreshGarmothLink).toHaveBeenCalledTimes(1);
    expect(collectReplies(link).join('\n')).toMatch(/Espera \d+s/);
  });

  it('el cooldown es por usuario', async () => {
    await garmoth.execute(buildCommand('refresh', 'user_1'));
    await garmoth.execute(buildCommand('refresh', 'user_2'));

    expect(profileService.refreshGarmothLink).toHaveBeenCalledTimes(2);
  });

  it('view y unlink no tienen cooldown', async () => {
    await garmoth.execute(buildCommand('view'));
    await garmoth.execute(buildCommand('view'));
    await garmoth.execute(buildCommand('unlink'));
    await garmoth.execute(buildCommand('unlink'));

    expect(linkService.removeCharacterLink).toHaveBeenCalledTimes(2);
  });

  it('una URL invalida en link no consume el cooldown', async () => {
    const bad = buildCommand('link');
    bad.options.getString = () => 'https://evil.example/character/x';
    await garmoth.execute(bad);

    await garmoth.execute(buildCommand('refresh'));

    expect(profileService.refreshGarmothLink).toHaveBeenCalledTimes(1);
  });
});
