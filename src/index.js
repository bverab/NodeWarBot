require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const commandHandler = require('./handlers/commandHandler');
const buttonHandler = require('./handlers/buttonHandler');
const modalHandler = require('./handlers/modalHandler');
const interactionHandler = require('./handlers/interactionHandler');
const { initScheduler } = require('./services/schedulerService');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

commandHandler(client);

client.once(Events.ClientReady, () => {
  console.log(`Bot listo como ${client.user.tag}`);
  console.log(`Comandos cargados: ${client.commands.size}`);
  
  // Iniciar scheduler de eventos automáticos
  initScheduler(client);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    const scheduleCustomIds = new Set(['schedule_war_days', 'schedule_war_mentions']);

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isModalSubmit() || (interaction.isStringSelectMenu() && scheduleCustomIds.has(interaction.customId))) {
      return modalHandler(interaction);
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
      if (
        [
          'add_roles_bulk',
          'publish_war',
          'cancel_war',
          'skip_mentions_publish',
          'confirm_publish',
          'open_role_panel',
          'panel_select_role',
          'panel_edit_name',
          'panel_edit_slots',
          'panel_edit_icon',
          'panel_edit_permissions',
          'panel_set_permissions',
          'panel_clear_permissions',
          'panel_set_icon',
          'panel_open_icon_modal',
          'panel_clear_icon',
          'panel_delete_role'
        ].includes(interaction.customId) ||
        interaction.customId.startsWith('panel_')
      ) {
        return interactionHandler(interaction);
      }

      if (interaction.isButton() && (interaction.customId.startsWith('join_') || interaction.customId.startsWith('war_'))) {
        return buttonHandler(interaction);
      }
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    await command.execute(interaction);
  } catch (error) {
    console.error('Error general:', error);

    if (interaction.replied || interaction.deferred) {
      return;
    }

    try {
      await interaction.reply({
        content: 'Error ejecutando el comando',
        flags: 64
      });
    } catch (replyError) {
      if (replyError?.code === 40060 || replyError?.code === 10062) {
        console.warn(`No se pudo responder error global (${replyError.code})`);
        return;
      }

      console.error('Error al responder:', replyError);
    }
  }
});

client.login(process.env.TOKEN);
