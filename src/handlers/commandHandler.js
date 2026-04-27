const fs = require('fs');
const path = require('path');
const { logInfo, logWarn, logError } = require('../utils/appLogger');

module.exports = client => {
  client.commands = new Map();

  const commandsPath = path.join(__dirname, '../commands');
  const commandEntries = fs.readdirSync(commandsPath, { withFileTypes: true });

  logInfo('Cargando comandos', {
    action: 'command_bootstrap',
    commandsPath,
    fileCount: commandEntries.length
  });

  for (const entry of commandEntries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.js')) continue;

    try {
      const command = require(`../commands/${entry.name}`);
      if (!command?.data || typeof command.data.name !== 'string' || typeof command.execute !== 'function') {
        logWarn('Archivo de comando omitido por estructura invalida', {
          action: 'command_bootstrap',
          file: entry.name
        });
        continue;
      }

      client.commands.set(command.data.name, command);
    } catch (error) {
      logError('Error cargando comando', error, {
        action: 'command_bootstrap',
        file: entry.name
      });
    }
  }

  logInfo('Comandos cargados', {
    action: 'command_bootstrap',
    loaded: client.commands.size
  });
};
