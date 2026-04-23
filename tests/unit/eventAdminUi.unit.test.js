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

  it('usa panel especifico PvE en /event edit sin botones de roles legacy', () => {
    const payload = buildEventPanelPayload({
      id: 'event_pve_1',
      eventType: 'pve',
      name: 'PvE Evento',
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

    expect(componentIds.includes('panel_pve_edit_slots')).toBe(true);
    expect(componentIds.includes('panel_pve_edit_access')).toBe(true);
    expect(componentIds.includes('panel_pve_manage_enrollments')).toBe(true);
    expect(componentIds.includes('panel_event_edit_roles')).toBe(false);
  });
});
