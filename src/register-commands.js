const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const DEFAULT_COMMANDS_PATH = path.join(__dirname, 'commands');
const SNOWFLAKE_REGEX = /^\d{17,20}$/;

// Carga los comandos de primer nivel. Un archivo que falla al cargar se reporta en `failures`:
// registrar sin el habria que Discord lo borre del servidor (el PUT reemplaza todo).
function loadCommands(commandsPath = DEFAULT_COMMANDS_PATH) {
  const commands = [];
  const failures = [];

  for (const fileEntry of fs.readdirSync(commandsPath, { withFileTypes: true })) {
    if (!fileEntry.isFile()) continue;
    if (!fileEntry.name.endsWith('.js')) continue;

    try {
      const command = require(path.join(commandsPath, fileEntry.name));
      if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') {
        continue;
      }

      commands.push(command.data.toJSON());
    } catch (error) {
      failures.push({ file: fileEntry.name, message: error.message || String(error) });
    }
  }

  return { commands, failures };
}

function parseGuildIds(value, logger = console) {
  if (!value) return [];

  const rawIds = String(value)
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  const uniqueIds = [...new Set(rawIds)];
  const validIds = uniqueIds.filter(id => SNOWFLAKE_REGEX.test(id));
  const invalidIds = uniqueIds.filter(id => !SNOWFLAKE_REGEX.test(id));

  if (invalidIds.length > 0) {
    logger.warn(`WARN: invalid guild IDs ignored: ${invalidIds.join(', ')}`);
  }

  return validIds;
}

function formatGuildRegistrationError(error) {
  const code = error?.code ?? 'unknown';
  const status = error?.status ?? 'unknown';
  const message = error?.rawError?.message || error?.message || 'Unknown error';

  if (Number(code) === 50001) {
    return `Missing Access (code 50001). Check if bot is in guild and has scope applications.commands.`;
  }

  return `status=${status} code=${code} message=${message}`;
}

async function registerCommands({
  commandsPath = DEFAULT_COMMANDS_PATH,
  env = process.env,
  rest = null,
  logger = console
} = {}) {
  const { commands, failures: loadFailures } = loadCommands(commandsPath);
  if (loadFailures.length > 0) {
    const detail = loadFailures.map(failure => `${failure.file}: ${failure.message}`).join('; ');
    throw new Error(`Failed to load command file(s): ${detail}. Aborting so no command is removed from the guilds.`);
  }

  if (!env.TOKEN) {
    throw new Error('TOKEN is missing in .env');
  }

  const guildIds = parseGuildIds(env.GUILD_ID, logger);

  if (!env.CLIENT_ID) {
    throw new Error('CLIENT_ID is missing in .env');
  }

  if (guildIds.length === 0) {
    throw new Error('GUILD_ID has no valid values. Use format: id1,id2,id3');
  }

  if (commands.length === 0) {
    throw new Error('No slash commands found to register.');
  }

  const client = rest || new REST({ version: '10' }).setToken(env.TOKEN);
  logger.log(`Registering ${commands.length} command(s) in ${guildIds.length} guild(s)...`);

  const successes = [];
  const failures = [];

  for (const guildId of guildIds) {
    try {
      await client.put(
        Routes.applicationGuildCommands(env.CLIENT_ID, guildId),
        { body: commands }
      );

      successes.push(guildId);
      logger.log(`OK guild ${guildId}`);
    } catch (error) {
      const detail = formatGuildRegistrationError(error);
      failures.push({ guildId, detail });
      logger.error(`FAIL guild ${guildId}: ${detail}`);
    }
  }

  logger.log('\nRegistration summary');
  logger.log(`- Success: ${successes.length}`);
  if (successes.length > 0) {
    logger.log(`  ${successes.join(', ')}`);
  }

  logger.log(`- Failed: ${failures.length}`);
  for (const failure of failures) {
    logger.log(`  ${failure.guildId}: ${failure.detail}`);
  }

  return { successes, failures };
}

// Devuelve el codigo de salida: distinto de 0 si algo falla (carga, validacion o cualquier servidor).
async function run(options = {}) {
  const logger = options.logger || console;
  try {
    const { failures } = await registerCommands({ ...options, logger });
    return failures.length > 0 ? 1 : 0;
  } catch (error) {
    logger.error('Failed to register commands:', error.message || error);
    return 1;
  }
}

if (require.main === module) {
  require('dotenv').config();
  run().then(code => {
    process.exitCode = code;
  });
}

module.exports = {
  loadCommands,
  parseGuildIds,
  registerCommands,
  run
};
