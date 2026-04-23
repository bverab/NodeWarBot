const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const { getEventTypeMeta, normalizeEventType } = require('../constants/eventTypes');

function getCreateEventModalCustomId(eventType, templateId = null) {
  const normalized = normalizeEventType(eventType);
  const suffix = templateId ? `:${String(templateId).trim()}` : '';
  return `create_event_initial:${normalized}${suffix}`;
}

function setOptionalValue(input, value) {
  const text = String(value || '').trim();
  if (text) {
    input.setValue(text);
  }
}

async function showCreateEventModal(interaction, eventType = 'war', options = {}) {
  const normalized = normalizeEventType(eventType);
  const meta = getEventTypeMeta(normalized);
  const template = options.template || null;

  const modal = new ModalBuilder()
    .setCustomId(getCreateEventModalCustomId(normalized, template?.id))
    .setTitle(`Crear Evento: ${meta.label}`);

  const nameInput = new TextInputBuilder()
    .setCustomId('war_name_input')
    .setLabel('Nombre del evento')
    .setPlaceholder(normalized === 'siege' ? 'ej: Siege Domingo' : 'ej: Node War T2')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);
  setOptionalValue(nameInput, options.name || '');

  const typeInput = new TextInputBuilder()
    .setCustomId('war_type_input')
    .setLabel('Descripcion/Horario')
    .setPlaceholder(meta.defaultDescription)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);
  setOptionalValue(typeInput, template?.typeDefault);

  const timezoneInput = new TextInputBuilder()
    .setCustomId('war_timezone_input')
    .setLabel('Zona horaria (ej: America/Bogota)')
    .setPlaceholder('America/Bogota')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50);
  setOptionalValue(timezoneInput, template?.timezone);

  const timeInput = new TextInputBuilder()
    .setCustomId('war_time_input')
    .setLabel('Hora de publicacion (HH:mm, ej: 22:00)')
    .setPlaceholder('22:00')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);
  setOptionalValue(timeInput, template?.time);

  const durationInput = new TextInputBuilder()
    .setCustomId('war_duration_input')
    .setLabel('Duracion/cierreAntes (min), ej: 90/30')
    .setPlaceholder('70 o 90/30')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(9);
  const templateDuration = Number.isFinite(template?.duration) ? template.duration : null;
  const templateCloseBefore = Number.isFinite(template?.closeBeforeMinutes) ? template.closeBeforeMinutes : null;
  if (templateDuration && templateDuration > 0) {
    const durationValue = templateCloseBefore && templateCloseBefore > 0
      ? `${templateDuration}/${templateCloseBefore}`
      : String(templateDuration);
    setOptionalValue(durationInput, durationValue);
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(typeInput),
    new ActionRowBuilder().addComponents(timezoneInput),
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(durationInput)
  );

  await interaction.showModal(modal);
}

module.exports = {
  showCreateEventModal,
  getCreateEventModalCustomId
};
