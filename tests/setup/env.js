const fs = require('fs');
const path = require('path');

const testDataDir = path.resolve(process.cwd(), 'data', 'test');
const testLegacyDir = path.join(testDataDir, 'legacy');
const testDbFile = path.join(testDataDir, 'nodewarbot.test.db').replace(/\\/g, '/');

fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testLegacyDir, { recursive: true });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${testDbFile}`;
process.env.NODEWARBOT_DATA_DIR = testLegacyDir;
