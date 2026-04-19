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

  const command = require(`./commands/${fileEntry.name}`);
  if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') {
    continue;
  }

  commands.push(command.data.toJSON());
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
    console.warn(`WARN: Invalid guild IDs ignored: ${invalidIds.join(', ')}`);
  }

  return validIds;
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

    console.log(`Registering commands in ${guildIds.length} guild(s)...`);

    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands }
      );

      console.log(`Commands registered in guild ${guildId}`);
    }
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
})();
