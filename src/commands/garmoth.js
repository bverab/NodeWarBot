const { SlashCommandBuilder } = require('discord.js');
const {
  getCharacterLink,
  upsertCharacterLink,
  removeCharacterLink
} = require('../services/garmothLinkService');
const { validateAndNormalizeGarmothProfileUrl } = require('../utils/garmothUrlHelper');
const { safeEphemeralReply } = require('../utils/interactionReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('garmoth')
    .setDescription('Gestiona tu perfil vinculado de Garmoth')
    .addSubcommand(subcommand =>
      subcommand
        .setName('link')
        .setDescription('Vincula tu perfil de Garmoth con una URL')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('URL del perfil de Garmoth')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('Muestra tu perfil de Garmoth vinculado')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unlink')
        .setDescription('Desvincula tu perfil de Garmoth')
    ),

  async execute(interaction) {
    try {
      if (!interaction.inGuild() || !interaction.guildId) {
        return await safeEphemeralReply(interaction, 'Este comando solo se puede usar dentro de un servidor.');
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'link') {
        return await handleLink(interaction);
      }

      if (subcommand === 'view') {
        return await handleView(interaction);
      }

      if (subcommand === 'unlink') {
        return await handleUnlink(interaction);
      }
    } catch (error) {
      console.error('Error en garmoth:', error);
      await safeEphemeralReply(interaction, 'Error procesando comando de Garmoth.');
    }
  }
};

async function handleLink(interaction) {
  const rawUrl = interaction.options.getString('url', true);
  const validation = validateAndNormalizeGarmothProfileUrl(rawUrl);
  if (!validation.ok) {
    return await safeEphemeralReply(
      interaction,
      `URL invalida: ${validation.reason}. Ejemplo esperado: https://garmoth.com/character/...`
    );
  }

  const saved = upsertCharacterLink({
    discordUserId: interaction.user.id,
    guildId: interaction.guildId,
    garmothProfileUrl: validation.url
  });

  const updatedAt = formatDiscordTimestamp(saved.updatedAt);
  return await safeEphemeralReply(
    interaction,
    `Perfil Garmoth vinculado correctamente.\nURL: ${saved.garmothProfileUrl}\nActualizado: ${updatedAt}`
  );
}

async function handleView(interaction) {
  const existing = getCharacterLink(interaction.user.id, interaction.guildId);
  if (!existing) {
    return await safeEphemeralReply(
      interaction,
      'No tienes perfil de Garmoth vinculado en este servidor. Usa `/garmoth link <url>`.'
    );
  }

  const linkedAt = formatDiscordTimestamp(existing.linkedAt);
  const updatedAt = formatDiscordTimestamp(existing.updatedAt);
  return await safeEphemeralReply(
    interaction,
    `Perfil vinculado en este servidor:\nURL: ${existing.garmothProfileUrl}\nVinculado: ${linkedAt}\nUltima actualizacion: ${updatedAt}`
  );
}

async function handleUnlink(interaction) {
  const removed = removeCharacterLink(interaction.user.id, interaction.guildId);
  if (!removed) {
    return await safeEphemeralReply(
      interaction,
      'No habia un perfil de Garmoth vinculado para tu usuario en este servidor.'
    );
  }

  return await safeEphemeralReply(interaction, 'Perfil de Garmoth desvinculado correctamente.');
}

function formatDiscordTimestamp(timestampMs) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return 'desconocido';
  const seconds = Math.floor(timestampMs / 1000);
  return `<t:${seconds}:F> (<t:${seconds}:R>)`;
}
