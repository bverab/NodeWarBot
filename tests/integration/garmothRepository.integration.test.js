const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const {
  upsertCharacterLink,
  getCharacterLink,
  getCharacterLinksByGuild,
  updateCharacterLink,
  removeCharacterLink
} = require('../../src/db/garmothProfileRepository');
const { buildGarmothLink } = require('../factories/garmothFactory');

setupIntegrationSuite();

describe('Garmoth repository integration', () => {
  it('link y view de perfil persistido', async () => {
    const link = buildGarmothLink({ discordUserId: 'u_g_1', guildId: 'g_1' });
    await upsertCharacterLink(link);

    const loaded = getCharacterLink('u_g_1', 'g_1');
    expect(loaded).toBeTruthy();
    expect(loaded.garmothProfileUrl).toBe(link.garmothProfileUrl);
  });

  it('refresh/update de perfil', async () => {
    const link = buildGarmothLink({ discordUserId: 'u_g_2', guildId: 'g_1', gearScore: 700 });
    await upsertCharacterLink(link);

    const updated = await updateCharacterLink('u_g_2', 'g_1', {
      gearScore: 745,
      syncStatus: 'partial',
      syncErrorMessage: 'partial data'
    });

    expect(updated).toBeTruthy();
    expect(updated.gearScore).toBe(745);
    expect(updated.syncStatus).toBe('partial');
  });

  it('unlink elimina perfil por user/guild', async () => {
    const link = buildGarmothLink({ discordUserId: 'u_g_3', guildId: 'g_2' });
    await upsertCharacterLink(link);

    const removed = await removeCharacterLink('u_g_3', 'g_2');
    const loaded = getCharacterLink('u_g_3', 'g_2');

    expect(removed).toBe(true);
    expect(loaded).toBeNull();
  });

  it('evita duplicados inconsistentes por usuario/guild', async () => {
    const base = buildGarmothLink({ discordUserId: 'u_g_4', guildId: 'g_4', garmothProfileUrl: 'https://garmoth.com/character/one' });
    await upsertCharacterLink(base);
    await upsertCharacterLink({ ...base, garmothProfileUrl: 'https://garmoth.com/character/two' });

    const links = getCharacterLinksByGuild('g_4').filter(entry => entry.discordUserId === 'u_g_4');
    expect(links.length).toBe(1);
    expect(links[0].garmothProfileUrl).toContain('/two');
  });
});
