async function safeEphemeralReply(interaction, content, options = {}) {
  try {
    if (interaction.replied || interaction.deferred) return false;
    await interaction.reply({ content, flags: 64, ...options });
    return true;
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      return false;
    }
    throw error;
  }
}

module.exports = {
  safeEphemeralReply
};
