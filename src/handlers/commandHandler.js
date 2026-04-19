const fs = require('fs');
const path = require('path');

module.exports = client => {
  client.commands = new Map();

  const commandsPath = path.join(__dirname, '../commands');
  const commandEntries = fs.readdirSync(commandsPath, { withFileTypes: true });

  console.log(`Buscando comandos en: ${commandsPath}`);
  console.log(`Archivos encontrados: ${commandEntries.map(entry => entry.name).join(', ')}`);

  for (const entry of commandEntries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.js')) continue;

    try {
      const command = require(`../commands/${entry.name}`);
      if (!command?.data || typeof command.data.name !== 'string' || typeof command.execute !== 'function') {
        continue;
      }

      client.commands.set(command.data.name, command);
      console.log(`Comando cargado: ${command.data.name}`);
    } catch (error) {
      console.error(`Error cargando comando ${entry.name}:`, error);
    }
  }

  console.log(`Total de comandos cargados: ${client.commands.size}`);
};
