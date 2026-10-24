// Respuestas de componentes de panel que pueden haberse diferido con deferUpdate().
// Sin diferir se comportan exactamente como interaction.update / interaction.reply.

// Reconoce la interaccion antes del trabajo lento (REST, publicacion). false si ya vencio.
async function deferComponentUpdate(interaction) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (error) {
    if (error?.code === 10062 || error?.code === 40060) return false;
    throw error;
  }
}

async function respondUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return await interaction.editReply(payload);
  }
  return await interaction.update(payload);
}

// Mensaje de error efimero: tras diferir ya no se puede usar reply().
async function respondError(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    return await interaction.followUp({ content, flags: 64 });
  }
  return await interaction.reply({ content, flags: 64 });
}

// Solo para handlers que NUNCA abren un modal (showModal exige no haber respondido antes).
function withDeferredUpdate(handler) {
  return async function deferredHandler(interaction) {
    if (!(await deferComponentUpdate(interaction))) return undefined;
    return await handler(interaction);
  };
}

module.exports = {
  deferComponentUpdate,
  respondUpdate,
  respondError,
  withDeferredUpdate
};
