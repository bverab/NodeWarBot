const fs = require('fs');
const path = require('path');
const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { createWar } = require('../../src/db/warRepository');
const { upsertCharacterLink } = require('../../src/db/garmothProfileRepository');
const { readWarsFromSqlite } = require('../../src/db/warRepository');
const { readGarmothProfilesFromSqlite } = require('../../src/db/garmothProfileRepository');
const { importJsonToSqlite } = require('../../src/db/importJsonToSqlite');
const { exportSqliteToJson } = require('../../src/db/exportSqliteToJson');
const { buildWar } = require('../factories/warFactory');
const { buildGarmothLink } = require('../factories/garmothFactory');

setupIntegrationSuite();

function writeLegacyFiles(baseDir, warsPayload, garmothPayload) {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(path.join(baseDir, 'wars.json'), JSON.stringify(warsPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(baseDir, 'garmoth-links.json'), JSON.stringify(garmothPayload, null, 2), 'utf8');
}

describe('Legacy import/export integration', () => {
  it('importa JSON legacy a SQLite y conserva datos esenciales', async () => {
    const legacyDir = path.resolve(process.cwd(), 'data', 'test', 'legacy-import-ok');
    process.env.NODEWARBOT_DATA_DIR = legacyDir;

    const war = buildWar({ id: 'legacy_war_1', name: 'LegacyWar' });
    const link = buildGarmothLink({ discordUserId: 'legacy_user_1', guildId: 'legacy_guild_1' });
    writeLegacyFiles(legacyDir, [war], [link]);

    const result = await importJsonToSqlite({ backup: true });
    const wars = await readWarsFromSqlite();
    const garmoth = await readGarmothProfilesFromSqlite();

    expect(result.importedWars).toBe(1);
    expect(result.importedGarmothProfiles).toBe(1);
    expect(wars.some(entry => entry.id === 'legacy_war_1')).toBe(true);
    expect(garmoth.some(entry => entry.discordUserId === 'legacy_user_1')).toBe(true);
    expect(fs.existsSync(result.backup.backupDir)).toBe(true);
  });

  it('tolera datos defectuosos en import legacy', async () => {
    const legacyDir = path.resolve(process.cwd(), 'data', 'test', 'legacy-import-bad');
    process.env.NODEWARBOT_DATA_DIR = legacyDir;

    const defectiveWars = [{ id: 'legacy_bad', roles: 'invalid-roles' }];
    const defectiveLinks = [
      { discordUserId: 'u_bad', garmothProfileUrl: 'https://garmoth.com/character/x' },
      { guildId: 'g_bad', garmothProfileUrl: 'https://garmoth.com/character/y' }
    ];
    writeLegacyFiles(legacyDir, defectiveWars, defectiveLinks);

    const result = await importJsonToSqlite({ backup: false });
    const wars = await readWarsFromSqlite();
    const garmoth = await readGarmothProfilesFromSqlite();

    expect(result.importedWars).toBe(1);
    expect(result.importedGarmothProfiles).toBe(0);
    expect(wars.length).toBe(1);
    expect(garmoth.length).toBe(0);
  });

  it('exporta SQLite a JSON manualmente', async () => {
    const exportBaseDir = path.resolve(process.cwd(), 'data', 'test', 'exports-check');
    const war = buildWar({ id: 'export_war_1' });
    const link = buildGarmothLink({ discordUserId: 'export_user_1', guildId: 'export_guild_1' });
    await createWar(war);
    await upsertCharacterLink(link);

    const result = await exportSqliteToJson({
      outputBaseDir: exportBaseDir,
      timestamp: 'manual-export'
    });

    const warsRaw = JSON.parse(fs.readFileSync(result.warsPath, 'utf8'));
    const linksRaw = JSON.parse(fs.readFileSync(result.garmothPath, 'utf8'));

    expect(result.exportedWars).toBe(1);
    expect(result.exportedGarmothProfiles).toBe(1);
    expect(warsRaw[0].id).toBe('export_war_1');
    expect(linksRaw[0].discordUserId).toBe('export_user_1');
  });
});
