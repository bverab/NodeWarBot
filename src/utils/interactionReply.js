async function safeEphemeralReply(interaction, content, options = {}) {
  try {
    if (interaction.replied || interaction.deferred) return false;
    await interaction.reply({
      content,
      flags: 64,
      allowedMentions: { parse: [] },
      ...options
    });
    return true;
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      return false;
    }
    throw error;
  }
}

// Para los catch de los comandos: si la interaccion ya se difirio edita la respuesta
// (evita que quede en "pensando..."), si ya se respondio envia un followUp efimero.
async function replyOrEdit(interaction, content, options = {}) {
  const payload = { content, allowedMentions: { parse: [] }, ...options };
  try {
    if (interaction.deferred) {
      await interaction.editReply(payload);
    } else if (interaction.replied) {
      await interaction.followUp({ flags: 64, ...payload });
    } else {
      await interaction.reply({ flags: 64, ...payload });
    }
    return true;
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      return false;
    }
    throw error;
  }
}

module.exports = {
  safeEphemeralReply,
  replyOrEdit
};
