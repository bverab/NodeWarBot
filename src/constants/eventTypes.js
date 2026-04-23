const EVENT_TYPES = {
  war: {
    key: 'war',
    label: 'Node War',
    defaultDescription: 'Evento de guerra'
  },
  siege: {
    key: 'siege',
    label: 'Siege War',
    defaultDescription: 'Evento de asedio'
  },
  pve: {
    key: 'pve',
    label: 'PvE',
    defaultDescription: 'Evento PvE'
  },
  '10v10': {
    key: '10v10',
    label: '10v10',
    defaultDescription: 'Evento 10v10'
  }
};

function normalizeEventType(value) {
  const key = String(value || 'war').trim().toLowerCase();
  return EVENT_TYPES[key] ? key : 'war';
}

function getEventTypeMeta(value) {
  const key = normalizeEventType(value);
  return EVENT_TYPES[key];
}

module.exports = {
  EVENT_TYPES,
  normalizeEventType,
  getEventTypeMeta
};
