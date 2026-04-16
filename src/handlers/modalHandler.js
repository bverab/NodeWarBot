const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = async interaction => {
  try {
    if (interaction.customId === 'create_war_initial') {
      return await handleWarCreation(interaction);
    }

    if (interaction.customId === 'add_roles_bulk') {
      return await handleAddRolesBulk(interaction);
    }
  } catch (error) {
    console.error('Error en modalHandler:', error);
    await safeRespond(interaction, 'Error procesando el modal');
  }
};

async function handleWarCreation(interaction) {
  const acknowledged = await safeDefer(interaction);
  if (!acknowledged) return;

  const name = interaction.fields.getTextInputValue('war_name_input');
  const type = interaction.fields.getTextInputValue('war_type_input') || 'Horario por definir';
  const initialRolesInput = interaction.fields.getTextInputValue('initial_roles_input').trim();

  const warData = {
    id: Date.now().toString(),
    name,
    type,
    roles: [],
    waitlist: [],
    creatorId: interaction.user.id,
    createdAt: Date.now(),
    closesAt: Date.now() + 48 * 60 * 60 * 1000,
    isClosed: false
  };

  if (initialRolesInput) {
    const lines = initialRolesInput.split('\n').map(line => line.trim()).filter(Boolean);

    for (const line of lines) {
      const roleData = parseRoleLine(line, interaction);
      if (!roleData) continue;
      warData.roles.push(roleData);
    }
  }

  if (!global.warEdits) global.warEdits = {};
  global.warEdits[interaction.user.id] = warData;

  await showWarEditor(interaction, warData);
}

async function handleAddRolesBulk(interaction) {
  const acknowledged = await safeDefer(interaction);
  if (!acknowledged) return;

  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await safeRespond(interaction, 'Sesion expirada');
  }

  if (warData.creatorId !== interaction.user.id) {
    return await safeRespond(interaction, 'Solo el creador puede agregar roles');
  }

  const lines = interaction.fields
    .getTextInputValue('roles_text')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  let rolesAdded = 0;
  for (const line of lines) {
    const roleData = parseRoleLine(line, interaction);
    if (!roleData) continue;

    warData.roles.push(roleData);
    rolesAdded += 1;
  }

  if (rolesAdded === 0) {
    return await safeRespond(interaction, 'Formato: `nombre: slots` (una por linea)');
  }

  await showWarEditor(interaction, warData);
}

function parseRoleLine(line, interaction) {
  const lineMatch = line.match(/^(.+?)\s*:\s*(\d+)\s*$/);
  if (!lineMatch) return null;

  const leftPart = lineMatch[1].trim();
  const max = Number.parseInt(lineMatch[2], 10);
  if (Number.isNaN(max) || max < 1) return null;

  const extracted = extractEmojiAndName(leftPart, interaction);
  if (!extracted.cleanName) return null;

  return {
    name: extracted.cleanName,
    max,
    emoji: extracted.emoji,
    emojiSource: extracted.emojiSource,
    users: [],
    allowedRoleIds: [],
    allowedRoles: []
  };
}

function extractEmojiAndName(text, interaction) {
  const customEmojiMatch = text.match(/^(<a?:[A-Za-z0-9_]+:(\d+)>)\s*(.+)$/);
  if (customEmojiMatch) {
    const emojiId = customEmojiMatch[2];
    const isGuildEmoji = Boolean(interaction.guild?.emojis?.cache?.get(emojiId));

    return {
      emoji: customEmojiMatch[1],
      emojiSource: isGuildEmoji ? 'guild' : 'custom',
      cleanName: customEmojiMatch[3].trim()
    };
  }

  const unicodeEmojiMatch = text.match(/^(\p{Extended_Pictographic})\s*(.+)$/u);
  if (unicodeEmojiMatch) {
    return {
      emoji: unicodeEmojiMatch[1],
      emojiSource: 'unicode',
      cleanName: unicodeEmojiMatch[2].trim()
    };
  }

  return {
    emoji: null,
    emojiSource: null,
    cleanName: text.trim()
  };
}

async function showWarEditor(interaction, warData) {
  const cols = [[], [], []];
  warData.roles.forEach((role, index) => {
    const restrictedCount = Array.isArray(role.allowedRoleIds) ? role.allowedRoleIds.length : 0;
    const restrictedTag = restrictedCount > 0 ? ` [perm:${restrictedCount}]` : '';
    cols[index % 3].push(`${role.emoji || 'o'} **${role.name}** (${role.max})${restrictedTag}`);
  });

  const rolesText = cols.map(col => col.join('\n') || '-').join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle(`Editor: ${warData.name}`)
    .setDescription(warData.type)
    .setColor(0x5865f2)
    .addFields({ name: 'Roles', value: rolesText || '*(Sin roles)*', inline: false })
    .setFooter({ text: `${warData.roles.length} roles | Editor (solo creador)` });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('add_roles_bulk')
      .setLabel('Agregar Roles')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('open_role_panel')
      .setLabel('Editar Roles')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('publish_war')
      .setLabel('Publicar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cancel_war')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [buttons] });
}

async function safeDefer(interaction) {
  if (interaction.deferred || interaction.replied) return true;

  try {
    await interaction.deferReply({ flags: 64 });
    return true;
  } catch (error) {
    if (error?.code === 40060) {
      return true;
    }

    if (error?.code === 10062) {
      console.warn('Modal ignorado: interaction expirada (10062)');
      return false;
    }

    throw error;
  }
}

async function safeRespond(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
      return;
    }

    await interaction.reply({ content, flags: 64 });
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      console.warn(`No se pudo responder modal (${error.code})`);
      return;
    }

    throw error;
  }
}
