const schedulerService = require('./schedulerService');
const persistence = require('../db/init');
const { logInfo, logWarn, logError } = require('../utils/appLogger');

const REQUIRED_ENV_VARS = ['TOKEN', 'DATABASE_URL'];

let shutdownPromise = null;

function validateEnvironment(env = process.env) {
  const missing = REQUIRED_ENV_VARS.filter(name => !String(env[name] || '').trim());
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}. Configuralas en .env (ver .env.example).`);
  }
}

// Orden: detener scheduler -> esperar el tick en curso -> cerrar Discord -> cerrar la base.
async function runShutdown({ client = null } = {}) {
  schedulerService.stopScheduler();
  await schedulerService.waitForSchedulerIdle();

  if (client?.destroy) {
    try {
      await client.destroy();
    } catch (error) {
      logError('Error cerrando cliente Discord', error, { action: 'shutdown' });
    }
  }

  await persistence.shutdownPersistence();
  logInfo('Bot detenido', { action: 'shutdown' });
}

function shutdown(options = {}) {
  if (!shutdownPromise) {
    shutdownPromise = runShutdown(options);
  }
  return shutdownPromise;
}

// Respuesta de respaldo cuando un handler lanza: nunca responde autocompletes y, si la
// interaccion ya se difirio sin respuesta, la completa en vez de dejarla "pensando".
async function replyWithInteractionError(interaction) {
  if (interaction.isAutocomplete?.()) return;
  if (interaction.replied) return;

  const payload = {
    content: 'Error ejecutando el comando',
    allowedMentions: { parse: [] }
  };

  try {
    if (interaction.deferred && interaction.isChatInputCommand?.()) {
      await interaction.editReply(payload);
    } else if (interaction.deferred) {
      await interaction.followUp({ ...payload, flags: 64 });
    } else {
      await interaction.reply({ ...payload, flags: 64 });
    }
  } catch (replyError) {
    if (replyError?.code === 40060 || replyError?.code === 10062) {
      logWarn('No se pudo responder error global de interaccion', {
        action: 'interaction_error_reply',
        guildId: interaction.guildId,
        userId: interaction.user?.id,
        eventId: interaction.message?.id || null,
        code: replyError.code
      });
      return;
    }

    logError('Error al responder fallback global de interaccion', replyError, {
      action: 'interaction_error_reply',
      guildId: interaction.guildId,
      userId: interaction.user?.id,
      eventId: interaction.message?.id || null
    });
  }
}

module.exports = {
  validateEnvironment,
  shutdown,
  replyWithInteractionError
};
