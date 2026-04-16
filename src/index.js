require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const commandHandler = require('./handlers/commandHandler');
const buttonHandler = require('./handlers/buttonHandler');
const modalHandler = require('./handlers/modalHandler');
const interactionHandler = require('./handlers/interactionHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

// cargar comandos
commandHandler(client);

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
  console.log(`📋 Comandos cargados: ${client.commands.size}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    // Log de interacción
    console.log(`📨 Interacción recibida: ${interaction.type}`);

    // Procesar autocompletado
    if (interaction.isAutocomplete()) {
      console.log('🔍 Procesando autocompletado:', interaction.options.getSubcommand(false));
      const command = client.commands.get(interaction.commandName);
      if (command) {
        await command.execute(interaction);
      }
      return;
    }

    // Procesar modales
    if (interaction.isModalSubmit()) {
      console.log('🎯 Procesando modal:', interaction.customId);
      return modalHandler(interaction);
    }

    // Procesar botones y select menus de edición
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      console.log('🎯 Procesando interacción:', interaction.customId);
      
      // Si es parte del editor de eventos
      if (['add_roles_bulk', 'publish_war', 'cancel_war'].includes(interaction.customId)) {
        return interactionHandler(interaction);
      }

      // Si es botón de unirse al evento
      if (interaction.isButton() && interaction.customId.startsWith('join_')) {
        return buttonHandler(interaction);
      }
    }

    // Procesar comandos
    if (!interaction.isChatInputCommand()) {
      console.log('⚠️ Interacción no es comando');
      return;
    }

    console.log(`⚡ Comando ejecutado: ${interaction.commandName}`);
    
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.log(`❌ Comando no encontrado: ${interaction.commandName}`);
      return;
    }

    console.log(`✅ Ejecutando comando: ${command.data.name}`);
    await command.execute(interaction);

  } catch (error) {
    console.error('❌ Error general:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: '❌ Error ejecutando el comando',
          ephemeral: true
        });
      } catch (replyError) {
        console.error('❌ Error al responder:', replyError);
      }
    }
  }
});

client.login(process.env.TOKEN);