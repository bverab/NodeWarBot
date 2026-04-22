const fs = require('fs');
const path = require('path');
const { prisma } = require('../../src/db/client');
const { initializePersistence, shutdownPersistence } = require('../../src/db/init');
const { __resetWarRepositoryForTests, saveWars } = require('../../src/db/warRepository');
const { __resetGarmothProfileRepositoryForTests, saveCharacterLinks } = require('../../src/db/garmothProfileRepository');

const testDataDir = path.resolve(process.cwd(), 'data', 'test');
const testDbPath = path.join(testDataDir, 'nodewarbot.test.db');
const defaultLegacyDir = path.join(testDataDir, 'legacy');

function splitSqlStatements(sqlText) {
  const lines = sqlText
    .split('\n')
    .filter(line => !line.trim().startsWith('--'));

  const statements = [];
  let current = '';
  for (const line of lines) {
    current += `${line}\n`;
    if (line.trim().endsWith(';')) {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
    }
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function runMigrationsForTestDb() {
  const migrationsDir = path.resolve(process.cwd(), 'prisma', 'migrations');
  const migrationFolders = fs.readdirSync(migrationsDir)
    .filter(name => !name.endsWith('.toml'))
    .sort();

  await prisma.$connect();
  for (const folder of migrationFolders) {
    const migrationPath = path.join(migrationsDir, folder, 'migration.sql');
    if (!fs.existsSync(migrationPath)) continue;
    const sqlText = fs.readFileSync(migrationPath, 'utf8');
    const statements = splitSqlStatements(sqlText);
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

async function clearDatabase() {
  await saveWars([]);
  await saveCharacterLinks([]);
  await prisma.guild.deleteMany();
}

function setupIntegrationSuite() {
  beforeAll(async () => {
    fs.mkdirSync(testDataDir, { recursive: true });
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    __resetWarRepositoryForTests();
    __resetGarmothProfileRepositoryForTests();
    await runMigrationsForTestDb();
    await initializePersistence();
  });

  beforeEach(async () => {
    process.env.NODEWARBOT_DATA_DIR = defaultLegacyDir;
    fs.mkdirSync(defaultLegacyDir, { recursive: true });
    await clearDatabase();
  });

  afterAll(async () => {
    await shutdownPersistence();
    __resetWarRepositoryForTests();
    __resetGarmothProfileRepositoryForTests();
  });
}

module.exports = {
  setupIntegrationSuite,
  clearDatabase
};
