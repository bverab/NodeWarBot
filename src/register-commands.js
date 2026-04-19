require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath, { withFileTypes: true });
const SNOWFLAKE_REGEX = /^\d{17,20}$/;

for (const fileEntry of commandFiles) {
  if (!fileEntry.isFile()) continue;
  if (!fileEntry.name.endsWith('.js')) continue;

  try {
    const command = require(`./commands/${fileEntry.name}`);
    if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') {
      continue;
    }

    commands.push(command.data.toJSON());
  } catch (error) {
    console.warn(`WARN: failed to load command file ${fileEntry.name}: ${error.message}`);
  }
}

function parseGuildIds(value) {
  if (!value) return [];

  const rawIds = String(value)
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  const uniqueIds = [...new Set(rawIds)];
  const validIds = uniqueIds.filter(id => SNOWFLAKE_REGEX.test(id));
  const invalidIds = uniqueIds.filter(id => !SNOWFLAKE_REGEX.test(id));

  if (invalidIds.length > 0) {
    console.warn(`WARN: invalid guild IDs ignored: ${invalidIds.join(', ')}`);
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

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    const guildIds = parseGuildIds(process.env.GUILD_ID);

    if (!process.env.CLIENT_ID) {
      throw new Error('CLIENT_ID is missing in .env');
    }

    if (guildIds.length === 0) {
      throw new Error('GUILD_ID has no valid values. Use format: id1,id2,id3');
    }

    if (commands.length === 0) {
      throw new Error('No slash commands found to register.');
    }

    console.log(`Registering ${commands.length} command(s) in ${guildIds.length} guild(s)...`);

    const successes = [];
    const failures = [];

    for (const guildId of guildIds) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
          { body: commands }
        );

        successes.push(guildId);
        console.log(`OK guild ${guildId}`);
      } catch (error) {
        const detail = formatGuildRegistrationError(error);
        failures.push({ guildId, detail });
        console.error(`FAIL guild ${guildId}: ${detail}`);
      }
    }

    console.log('\nRegistration summary');
    console.log(`- Success: ${successes.length}`);
    if (successes.length > 0) {
      console.log(`  ${successes.join(', ')}`);
    }

    console.log(`- Failed: ${failures.length}`);
    if (failures.length > 0) {
      for (const failure of failures) {
        console.log(`  ${failure.guildId}: ${failure.detail}`);
      }
    }

    if (successes.length === 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Failed to register commands:', error.message || error);
    process.exitCode = 1;
  }
})();
