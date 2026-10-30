const fs = require('fs');
const path = require('path');
const { setupIntegrationSuite, readMigrationStatements } = require('../helpers/dbTestHarness');
const { prisma } = require('../../src/db/client');

setupIntegrationSuite();

/**
 * PRAGMA foreign_keys es por conexion: si el harness lo ejecuta por el pool de Prisma, OFF y ON pueden
 * caer en conexiones distintas. Esa conexion queda sin cascadas para todo el archivo de tests, y las
 * filas huerfanas rompen tests posteriores de forma intermitente.
 */
describe('core: harness de tests y claves foraneas', () => {
  it('las migraciones del harness no tocan el estado de claves foraneas de una conexion', () => {
    const migrationsDir = path.resolve(process.cwd(), 'prisma', 'migrations');
    const statements = fs.readdirSync(migrationsDir)
      .filter(name => !name.endsWith('.toml'))
      .flatMap(folder => readMigrationStatements(fs.readFileSync(path.join(migrationsDir, folder, 'migration.sql'), 'utf8')));

    expect(statements.length).toBeGreaterThan(0);
    expect(statements.filter(statement => /PRAGMA\s+(defer_)?foreign_keys/i.test(statement))).toEqual([]);
  });

  it('todas las conexiones del pool mantienen las claves foraneas activas', async () => {
    const samples = await Promise.all(Array.from({ length: 24 }, () => prisma.$queryRawUnsafe('PRAGMA foreign_keys')));

    expect(new Set(samples.map(rows => Number(Object.values(rows[0])[0])))).toEqual(new Set([1]));
  });
});
