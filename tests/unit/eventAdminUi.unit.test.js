const { buildEventPanelPayload } = require('../../src/utils/eventAdminUi');

describe('eventAdminUi panel principal', () => {
  it('expone cierre claro de edicion y no incluye accion directa de publicar/actualizar', () => {
    const payload = buildEventPanelPayload({
      id: 'event_1',
      name: 'Evento',
      schedule: { mode: 'once' },
      isClosed: false,
      messageId: null,
      dayOfWeek: 1,
      time: '20:00',
      roles: []
    });

    const componentIds = payload.components
      .flatMap(row => row.components || [])
      .map(component => component?.data?.custom_id)
      .filter(Boolean);

    expect(componentIds.includes('panel_event_publish_update')).toBe(false);
    expect(componentIds.includes('panel_event_finish_keep')).toBe(true);
    expect(componentIds.includes('panel_event_finish_publish')).toBe(true);
  });
});
