const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const warService = require('../services/warService');

module.exports = async (interaction) => {
  try {
    if (interaction.customId === 'create_war_initial') {
      return await handleWarCreation(interaction);
    }
    if (interaction.customId === 'add_roles_bulk') {
      return await handleAddRolesBulk(interaction);
    }
  } catch (error) {
    console.error('❌ Error en modalHandler:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Error', flags: 64 });
    }
  }
};

async function handleWarCreation(interaction) {
  const name = interaction.fields.getTextInputValue('war_name_input');
  const type = interaction.fields.getTextInputValue('war_type_input') || 'Evento';
  const initialRolesInput = interaction.fields.getTextInputValue('initial_roles_input').trim();

  const warData = {
    id: Date.now().toString(),
    name,
    type,
    roles: [],
    waitlist: [],
    creatorId: interaction.user.id
  };

  // Procesar roles iniciales si se proporcionan
  if (initialRolesInput) {
    const lines = initialRolesInput.split('\n').map(l => l.trim()).filter(l => l);
    for (const line of lines) {
      const [roleName, maxStr] = line.split(':').map(s => s.trim());
      const emoji = roleName.match(/[\p{Emoji}]/u)?.[0] || null;
      const cleanName = roleName.replace(/[\p{Emoji}]/gu, '').trim();
      const max = parseInt(maxStr);

      if (cleanName && !isNaN(max) && max > 0) {
        warData.roles.push({
          name: cleanName,
          max,
          emoji,
          users: [],
          allowedRoles: []
        });
      }
    }
  }

  if (!global.warEdits) global.warEdits = {};
  global.warEdits[interaction.user.id] = warData;

  await interaction.deferReply({ flags: 64 });
  await showWarEditor(interaction, warData);
}

async function handleAddRolesBulk(interaction) {
  const warData = global.warEdits?.[interaction.user.id];
  if (!warData) {
    return await interaction.reply({ content: '❌ Sesión expirada', flags: 64 });
  }

  if (warData.creatorId !== interaction.user.id) {
    return await interaction.reply({ content: '❌ Solo el creador puede agregar roles', flags: 64 });
  }

  const rolesInput = interaction.fields.getTextInputValue('roles_text');
  const lines = rolesInput.split('\n').map(l => l.trim()).filter(l => l);

  let rolesAdded = 0;
  for (const line of lines) {
    const [name, maxStr] = line.split(':').map(s => s.trim());
    const emoji = name.match(/[\p{Emoji}]/u)?.[0] || null;
    const cleanName = name.replace(/[\p{Emoji}]/gu, '').trim();
    const max = parseInt(maxStr);

    if (!cleanName || isNaN(max) || max < 1) continue;

    warData.roles.push({
      name: cleanName,
      max,
      emoji,
      users: [],
      allowedRoles: []
    });
    rolesAdded++;
  }

  if (rolesAdded === 0) {
    return await interaction.reply({ content: '❌ Formato: `nombre: slots` (una por línea)', flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  await showWarEditor(interaction, warData, true);
}

async function showWarEditor(interaction, warData, isUpdate = false) {
  // Layout horizontal (3 columnas de roles)
  const roleLines = [];
  const cols = [[], [], []];
  
  warData.roles.forEach((r, idx) => {
    cols[idx % 3].push(`${r.emoji || '⚪'} **${r.name}** (${r.max})`);
  });

  const rolesText = cols
    .map(col => col.join('\n') || '—')
    .join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${warData.name}`)
    .setDescription(warData.type)
    .setColor(0x5865F2)
    .addFields({ name: '👥 Roles', value: rolesText || '*(Sin roles)*', inline: false })
    .setFooter({ text: `${warData.roles.length} roles | Editor (solo creador)` });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('add_roles_bulk')
      .setLabel('➕ Agregar Roles')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(warData.creatorId !== interaction.user.id),
    new ButtonBuilder()
      .setCustomId('publish_war')
      .setLabel('✅ Publicar')
      .setStyle(ButtonStyle.Success)
      .setDisabled(warData.creatorId !== interaction.user.id),
    new ButtonBuilder()
      .setCustomId('cancel_war')
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(warData.creatorId !== interaction.user.id)
  );

  if (isUpdate && (interaction.replied || interaction.deferred)) {
    await interaction.editReply({ embeds: [embed], components: [buttons] });
  } else if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: [buttons] });
  } else {
    await interaction.reply({ embeds: [embed], components: [buttons], flags: 64 });
  }
}
