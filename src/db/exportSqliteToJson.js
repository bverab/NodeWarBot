const fs = require('fs');
const path = require('path');
const { prisma } = require('./client');
const { readWarsFromSqlite } = require('./warRepository');
const { readGarmothProfilesFromSqlite } = require('./garmothProfileRepository');
const { getDataDirPath } = require('./jsonStore');

async function exportSqliteToJson(options = {}) {
  const timestamp = options.timestamp || new Date().toISOString().replace(/[:.]/g, '-');
  const baseDir = options.outputBaseDir ? path.resolve(options.outputBaseDir) : path.join(getDataDirPath(), 'exports');
  const outputDir = path.join(baseDir, timestamp);
  fs.mkdirSync(outputDir, { recursive: true });

  await prisma.$connect();
  const wars = await readWarsFromSqlite();
  const links = await readGarmothProfilesFromSqlite();

  const warsPath = path.join(outputDir, 'wars.json');
  const garmothPath = path.join(outputDir, 'garmoth-links.json');

  fs.writeFileSync(warsPath, JSON.stringify(wars, null, 2), 'utf8');
  fs.writeFileSync(garmothPath, JSON.stringify(links, null, 2), 'utf8');

  return {
    outputDir,
    warsPath,
    garmothPath,
    exportedWars: wars.length,
    exportedGarmothProfiles: links.length
  };
}

module.exports = {
  exportSqliteToJson
};
