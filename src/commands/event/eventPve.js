function buildEventTypeChoices(includePlaceholder = true) {
  const choices = [
    { name: 'War', value: 'war' },
    { name: 'Siege', value: 'siege' },
    { name: 'PvE', value: 'pve' }
  ];
  if (includePlaceholder) {
    choices.push({ name: '10v10 (placeholder)', value: '10v10' });
  }
  return choices;
}

function isPlaceholderEventType(eventType) {
  return String(eventType || '').toLowerCase() === '10v10';
}

module.exports = {
  buildEventTypeChoices,
  isPlaceholderEventType
};
