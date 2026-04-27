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
    expect(componentIds.includes('panel_pve_toggle_close')).toBe(true);
    expect(componentIds.includes('panel_event_edit_roles')).toBe(false);
  });

  it('muestra accion PvE de cerrar/reactivar inscripciones segun estado', () => {
    const openPayload = buildEventPanelPayload({
      id: 'event_pve_open',
      eventType: 'pve',
      name: 'PvE Open',
      schedule: { mode: 'once' },
      isClosed: false,
      messageId: 'msg_open',
      dayOfWeek: 2,
      time: '21:00',
      roles: []
    });
    const closedPayload = buildEventPanelPayload({
      id: 'event_pve_closed',
      eventType: 'pve',
      name: 'PvE Closed',
      schedule: { mode: 'once' },
      isClosed: true,
      messageId: 'msg_closed',
      dayOfWeek: 2,
      time: '21:00',
      roles: []
    });

    const openButton = openPayload.components
      .flatMap(row => row.components || [])
      .find(component => component?.data?.custom_id === 'panel_pve_toggle_close');
    const closedButton = closedPayload.components
      .flatMap(row => row.components || [])
      .find(component => component?.data?.custom_id === 'panel_pve_toggle_close');

    expect(openButton?.data?.label).toBe('Cerrar inscripciones');
    expect(closedButton?.data?.label).toBe('Reactivar inscripciones');
  });
});
