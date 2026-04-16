const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getWarByMessageId, updateWar, addToWaitlist, removeFromWaitlist, removeUserFromAllRoles } = require('../services/warService');

module.exports = async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    await interaction.deferUpdate();

    const war = getWarByMessageId(interaction.message.id);
    if (!war) {
      await interaction.followUp({
        content: '❌ No se encontró el evento',
        flags: 64
      });
      return;
    }

    const userId = interaction.user.id;
    const userName = interaction.user.username;

    // Botones de roles
    if (interaction.customId.startsWith('join_')) {
      const roleName = interaction.customId.replace('join_', '');
      const role = war.roles.find(r => r.name === roleName);

      if (!role) {
        await interaction.followUp({
          content: '❌ El rol no existe',
          flags: 64
        });
        return;
      }

      // Verificar restricción de roles
      if (role.allowedRoles && role.allowedRoles.length > 0) {
        if (!interaction.member) {
          await interaction.followUp({
            content: '❌ No se pudo verificar tu identidad',
            flags: 64
          });
          return;
        }

        const hasRequiredRole = role.allowedRoles.some(requiredRole =>
          interaction.member.roles.cache.some(memberRole => memberRole.name === requiredRole)
        );

        if (!hasRequiredRole) {
          await interaction.followUp({
            content: `❌ No tienes permiso. Roles: ${role.allowedRoles.join(', ')}`,
            flags: 64
          });
          return;
        }
      }

      const displayName = interaction.member?.displayName || interaction.user.username;
      const currentRole = war.roles.find(r => r.users.find(u => u.includes(userId)));

      // Si ya está en el rol, retirar
      if (role.users.some(u => u.includes(userId))) {
        role.users = role.users.filter(u => !u.includes(userId));
        updateWar(war);

        await interaction.followUp({
          content: `✅ Te has retirado de **${role.name}**`,
          flags: 64
        });

        // Promover de waitlist
        const updatedWar = getWarByMessageId(interaction.message.id);
        if (updatedWar.waitlist.length > 0 && role.users.length < role.max) {
          const next = updatedWar.waitlist[0];
          const userEntry = `${next.userName}|${next.userId}`;
          role.users.push(userEntry);
          removeFromWaitlist(interaction.message.id, next.userId);
          updateWar(updatedWar);

          try {
            const user = await interaction.client.users.fetch(next.userId);
            await user.send(`✅ Te has unido a **${role.name}** ${role.emoji || ''} en el evento!`);
          } catch (e) {
            console.log('No se pudo notificar usuario');
          }
        }
      } else {
        // Unirse al rol
        if (role.users.length >= role.max) {
          const added = addToWaitlist(interaction.message.id, userId, userName, roleName);

          if (!added) {
            await interaction.followUp({
              content: '⏳ Ya estás en la lista de espera',
              flags: 64
            });
            return;
          }

          const updatedWar = getWarByMessageId(interaction.message.id);
          await interaction.followUp({
            content: `⏳ El rol está lleno. Has sido agregado a la lista (#${updatedWar.waitlist.length})`,
            flags: 64
          });

          await updateEventEmbed(interaction.message, updatedWar);
          return;
        }

        if (currentRole) {
          removeUserFromAllRoles(interaction.message.id, userId);
        }

        const displayName = interaction.member?.displayName || interaction.user.username;
        const userEntry = `${displayName}|${userId}`;
        role.users.push(userEntry);
        removeFromWaitlist(interaction.message.id, userId);
        updateWar(war);

        await interaction.followUp({
          content: `✅ Te has unido a **${role.name}** ${role.emoji || ''}`,
          flags: 64
        });
      }

      const updatedWar = getWarByMessageId(interaction.message.id);
      await updateEventEmbed(interaction.message, updatedWar);
    }

  } catch (error) {
    console.error("❌ Error en buttonHandler:", error);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: '❌ Error interno',
          flags: 64
        });
      } catch (e) {
        console.error("❌ Error al responder:", e);
      }
    } else {
      try {
        await interaction.followUp({
          content: '❌ Error interno',
          flags: 64
        });
      } catch (e) {
        console.error("❌ Error en follow-up:", e);
      }
    }
  }
};

async function updateEventEmbed(message, war) {
  try {
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${war.name || 'Node War'}`)
      .setDescription(war.type || 'Sin descripción')
      .setColor(0x5865F2);

    // Cada rol en su propio campo
    const roleFields = war.roles.map(role => {
      const users = role.users.length > 0 
        ? role.users.map(u => u.split('|')[0]).join('\n')
        : '—';
      
      return {
        name: `${role.emoji || '⚪'} ${role.name}`,
        value: `${role.users.length}/${role.max}\n${users}`,
        inline: true
      };
    });

    if (roleFields.length > 0) {
      embed.addFields(...roleFields);
    }

    // Waitlist con emojis
    if (war.waitlist && war.waitlist.length > 0) {
      const waitlistText = war.waitlist
        .map((w, idx) => {
          // Buscar el rol para obtener su emoji
          const roleInfo = war.roles.find(r => r.name === w.roleName);
          const roleLabel = roleInfo 
            ? `(${roleInfo.emoji || '⚪'} ${roleInfo.name})`
            : '';
          return `${idx + 1}. ${w.userName} ${roleLabel}`;
        })
        .join('\n');

      embed.addFields({
        name: `📋 Waitlist (${war.waitlist.length})`,
        value: waitlistText,
        inline: false
      });
    }

    // Botones (solo roles, sin waitlist)
    const buttons = [];
    let currentRow = new ActionRowBuilder();

    war.roles.forEach((role, idx) => {
      const btn = new ButtonBuilder()
        .setCustomId(`join_${role.name}`)
        .setLabel(`${role.emoji || '⚪'} ${role.name} (${role.users.length}/${role.max})`)
        .setStyle(ButtonStyle.Secondary);

      buttons.push(btn);
    });

    const rows = [];
    for (let i = 0; i < buttons.length; i++) {
      if (i > 0 && i % 5 === 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      currentRow.addComponents(buttons[i]);
    }

    if (currentRow.components.length > 0) {
      rows.push(currentRow);
    }

    await message.edit({ embeds: [embed], components: rows });
  } catch (e) {
    console.error('❌ Error actualizando embed:', e);
  }
}