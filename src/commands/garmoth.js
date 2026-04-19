const { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const {
  getCharacterLink,
  upsertCharacterLink,
  updateCharacterLink,
  removeCharacterLink
} = require('../services/garmothLinkService');
const { refreshGarmothLink } = require('../services/garmothProfileService');
const { validateAndNormalizeGarmothProfileUrl } = require('../utils/garmothUrlHelper');
const { resolveClassIconFile } = require('../utils/classIconResolver');
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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('refresh')
        .setDescription('Sincroniza manualmente datos basicos del perfil vinculado')
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

      if (subcommand === 'refresh') {
        return await handleRefresh(interaction);
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

  try {
    await interaction.deferReply({ flags: 64 });
    const { updatedLink, refreshResult } = await runRefreshAndPersist(interaction, saved);

    if (!updatedLink) {
      await interaction.editReply(
        'Perfil vinculado correctamente, pero no se pudo guardar el resultado del refresh automatico. Usa `/garmoth refresh`.'
      );
      return;
    }

    const payload = buildProfileEmbedPayload(updatedLink);
    if (refreshResult?.ok) {
      await interaction.editReply({
        content: 'Perfil vinculado y sincronizado automaticamente.',
        ...payload
      });
      return;
    }

    const reason = updatedLink.syncErrorMessage || refreshResult?.syncErrorMessage || 'No se pudo sincronizar en este momento.';
    await interaction.editReply({
      content: `Perfil vinculado correctamente, pero el refresh automatico fallo.\n${reason}`,
      ...payload
    });
  } catch (error) {
    console.error('Error en /garmoth link auto-refresh:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        'Perfil vinculado correctamente, pero no se pudo completar el refresh automatico. Usa `/garmoth refresh`.'
      );
      return;
    }
    await safeEphemeralReply(
      interaction,
      'Perfil vinculado correctamente, pero no se pudo completar el refresh automatico. Usa `/garmoth refresh`.'
    );
  }
}

async function handleView(interaction) {
  const existing = getCharacterLink(interaction.user.id, interaction.guildId);
  if (!existing) {
    return await safeEphemeralReply(
      interaction,
      'No tienes perfil de Garmoth vinculado en este servidor. Usa `/garmoth link <url>`. '
    );
  }

  const payload = buildProfileEmbedPayload(existing);
  return await replyEphemeralPayload(interaction, payload);
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

async function handleRefresh(interaction) {
  const existing = getCharacterLink(interaction.user.id, interaction.guildId);
  if (!existing) {
    return await safeEphemeralReply(
      interaction,
      'No tienes perfil de Garmoth vinculado en este servidor. Usa `/garmoth link <url>`. '
    );
  }

  try {
    await interaction.deferReply({ flags: 64 });
    const { updatedLink } = await runRefreshAndPersist(interaction, existing);

    if (!updatedLink) {
      await interaction.editReply('No se pudo actualizar el vinculo local. Intenta nuevamente.');
      return;
    }

    const payload = buildProfileEmbedPayload(updatedLink);
    await interaction.editReply(payload);
  } catch (error) {
    console.error('Error en /garmoth refresh:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('Error procesando refresh de Garmoth.');
      return;
    }
    await safeEphemeralReply(interaction, 'Error procesando refresh de Garmoth.');
  }
}

function buildProfileEmbedPayload(link = {}) {
  const characterName = normalizeHumanText(link.characterName);
  const className = normalizeHumanText(link.className);
  const spec = normalizeSpec(link.spec);
  const gearScore = normalizeGearScore(link.gearScore);

  const title = characterName || 'Perfil de Garmoth';
  const descriptionLines = [];

  const classSpecLine = [className, spec].filter(Boolean).join(' • ');
  if (classSpecLine) descriptionLines.push(classSpecLine);
  if (gearScore !== null) descriptionLines.push(`GS: ${gearScore}`);
  if (descriptionLines.length === 0) descriptionLines.push('Sin datos sincronizados aun.');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(descriptionLines.join('\n'))
    .setColor(0x2b2d31);

  const profileUrl = normalizeProfileUrl(link.garmothProfileUrl);
  if (profileUrl) {
    embed.setURL(profileUrl);
  }

  const files = [];
  const iconFile = resolveClassIconFile(className);
  if (iconFile) {
    files.push(new AttachmentBuilder(iconFile.filePath, { name: iconFile.fileName }));
    embed.setThumbnail(`attachment://${iconFile.fileName}`);
  }

  return files.length > 0 ? { embeds: [embed], files } : { embeds: [embed] };
}

async function replyEphemeralPayload(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) return false;
    await interaction.reply({ flags: 64, ...payload });
    return true;
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      return false;
    }
    throw error;
  }
}

function normalizeHumanText(value) {
  if (value === null || value === undefined) return '';
  const normalized = String(value).trim();
  if (!normalized) return '';
  if (/^\d+$/.test(normalized)) return '';
  return normalized;
}

function normalizeSpec(value) {
  if (value === 'Awakening' || value === 'Succession') return value;
  return '';
}

function normalizeGearScore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeProfileUrl(value) {
  const normalized = String(value || '').trim();
  return normalized || '';
}

async function runRefreshAndPersist(interaction, link) {
  const refreshResult = await refreshGarmothLink(link);
  const updatedLink = updateCharacterLink(
    interaction.user.id,
    interaction.guildId,
    refreshResult.patch
  );
  return { updatedLink, refreshResult };
}

function formatDiscordTimestamp(timestampMs) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return 'desconocido';
  const seconds = Math.floor(timestampMs / 1000);
  return `<t:${seconds}:F> (<t:${seconds}:R>)`;
}
