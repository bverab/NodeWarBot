const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { prisma } = require('../../src/db/client');

setupIntegrationSuite();

describe('core: SQLite en modo WAL', () => {
  it('la base queda en journal_mode=wal tras inicializar la persistencia', async () => {
    const rows = await prisma.$queryRawUnsafe('PRAGMA journal_mode');

    expect(String(rows[0]?.journal_mode).toLowerCase()).toBe('wal');
  });
});
