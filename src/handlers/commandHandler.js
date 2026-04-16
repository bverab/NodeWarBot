const fs = require('fs');
const path = require('path');

module.exports = (client) => {
  client.commands = new Map();

  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath);

  console.log(`📂 Buscando comandos en: ${commandsPath}`);
  console.log(`📋 Archivos encontrados: ${commandFiles.join(', ')}`);

  for (const file of commandFiles) {
    try {
      const command = require(`../commands/${file}`);
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Comando cargado: ${command.data.name}`);
      } else {
        console.warn(`⚠️ Comando incompleto en ${file}: falta data o execute`);
      }
    } catch (error) {
      console.error(`❌ Error cargando comando ${file}:`, error);
    }
  }

  console.log(`✨ Total de comandos cargados: ${client.commands.size}`);
};