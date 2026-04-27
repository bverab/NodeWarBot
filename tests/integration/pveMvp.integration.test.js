const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const pveService = require('../../src/services/pveService');
const { buildWar } = require('../factories/warFactory');
const { buildEventMessagePayload } = require('../../src/services/eventRenderService');
const { addSeriesDay } = require('../../src/services/recurrenceSeriesService');

setupIntegrationSuite();

describe('PvE MVP integration', () => {
  it('persiste horarios por evento y renderiza cupos/inscritos', async () => {
    const event = buildWar({
      id: 'pve_event_1',
      groupId: 'pve_group_1',
      eventType: 'pve',
      name: 'Boss Rush',
      roles: [],
      waitlist: [],
      schedule: { enabled: true, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null }
    });

    await warService.createWar(event);
    await pveService.saveEventSlots(event.id, [
      { position: 0, label: '20:00', time: '20:00', capacity: 2 },
      { position: 1, label: '21:30', time: '21:30', capacity: 2 }
    ]);

    const joinResult = await pveService.joinSlot(event.id, (await pveService.getEventSlots(event.id))[0].id, {
      userId: 'user_1',
      displayName: 'User One',
      isFake: false
    });
    expect(joinResult.ok).toBe(true);

    const payload = await buildEventMessagePayload(event);
    const fields = payload.embeds[0].data.fields || [];
    const firstField = fields.find(field => String(field.name).includes('20:00'));

    expect(firstField).toBeTruthy();
    expect(String(firstField.name)).toContain('(1/2)');
    expect(String(firstField.value)).toContain('User One');
  });

  it('permite multiples horarios por usuario y usa toggle en el mismo horario', async () => {
    const event = buildWar({
      id: 'pve_event_2',
      groupId: 'pve_group_2',
      eventType: 'pve',
      roles: [],
      waitlist: [],
      schedule: { enabled: true, mode: 'once', lastCreatedAt: null, lastMessageIdDeleted: null }
    });

    await warService.createWar(event);
    await pveService.saveEventSlots(event.id, [
      { position: 0, label: '20:00', time: '20:00', capacity: 1 },
      { position: 1, label: '21:30', time: '21:30', capacity: 1 }
    ]);

    const options = await pveService.getEventSlots(event.id);
    const first = options[0];
    const second = options[1];

    const joinFirst = await pveService.joinSlot(event.id, first.id, {
      userId: 'user_1',
      displayName: 'User One',
      isFake: false
    });
    expect(joinFirst.ok).toBe(true);

    const joinSecond = await pveService.joinSlot(event.id, second.id, {
      userId: 'user_1',
      displayName: 'User One',
      isFake: false
    });
    expect(joinSecond.ok).toBe(true);
    expect(joinSecond.reason).toBe('joined');

    const toggleOffSameSlot = await pveService.joinSlot(event.id, second.id, {
      userId: 'user_1',
      displayName: 'User One',
      isFake: false
    });
    expect(toggleOffSameSlot.ok).toBe(true);
    expect(toggleOffSameSlot.reason).toBe('left');

    const optionsAfterToggle = await pveService.getEventSlots(event.id);
    const secondAfterToggle = optionsAfterToggle.find(option => option.id === second.id);
    expect(secondAfterToggle.enrollments.some(entry => entry.userId === 'user_1')).toBe(false);

    const joinSecondUser = await pveService.joinSlot(event.id, first.id, {
      userId: 'user_2',
      displayName: 'User Two',
      isFake: false
    });
    expect(joinSecondUser.ok).toBe(false);
    expect(joinSecondUser.reason).toBe('full');

    const left = await pveService.leaveSlot(event.id, 'user_1');
    expect(left).toBe(true);

    const joinAfterLeave = await pveService.joinSlot(event.id, second.id, {
      userId: 'user_1',
      displayName: 'User One',
      isFake: false
    });
    expect(joinAfterLeave.ok).toBe(true);
  });

  it('clona horarios al agregar dia en recurrencia pve sin compartir inscripciones', async () => {
    const baseEvent = buildWar({
      id: 'pve_event_3_day2',
      groupId: 'pve_group_3',
      eventType: 'pve',
      channelId: 'channel_pve_3',
      dayOfWeek: 2,
      time: '20:00',
      roles: [],
      waitlist: [],
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });

    await warService.createWar(baseEvent);
    await pveService.saveEventSlots(baseEvent.id, [
      { position: 0, label: '20:00', time: '20:00', capacity: 3 },
      { position: 1, label: '21:30', time: '21:30', capacity: 3 }
    ]);

    const sourceOptions = await pveService.getEventSlots(baseEvent.id);
    const join = await pveService.joinSlot(baseEvent.id, sourceOptions[0].id, {
      userId: 'user_source',
      displayName: 'Source User',
      isFake: false
    });
    expect(join.ok).toBe(true);

    const added = await addSeriesDay(baseEvent, 'channel_pve_3', '20:00', 4);
    const clonedOptions = await pveService.getEventSlots(added.id);

    expect(clonedOptions.length).toBe(2);
    expect(clonedOptions[0].time).toBe('20:00');
    expect(clonedOptions[1].time).toBe('21:30');
    expect(clonedOptions[0].enrollments.length).toBe(0);
    expect(clonedOptions[1].enrollments.length).toBe(0);

    const sourceAfter = await pveService.getEventSlots(baseEvent.id);
    expect(sourceAfter[0].enrollments.length).toBe(1);
  });

  it('modo Open permite inscripcion normal sin roles permitidos', async () => {
    const event = buildWar({
      id: 'pve_event_open_1',
      eventType: 'pve',
      accessMode: 'OPEN',
      allowedUserIds: [],
      roles: [],
      waitlist: []
    });

    await warService.createWar(event);
    await pveService.saveEventSlots(event.id, [{ position: 0, label: '20:00', time: '20:00', capacity: 2 }]);
    const option = (await pveService.getEventSlots(event.id))[0];

    const join = await pveService.joinSlot(event.id, option.id, {
      userId: 'open_user',
      displayName: 'Open User',
      userRoleIds: []
    });

    expect(join.ok).toBe(true);
    expect(join.reason).toBe('joined');
  });

  it('modo Restricted usa usuarios permitidos: permitido entra normal y no permitido va a filler del horario', async () => {
    const event = buildWar({
      id: 'pve_event_restricted_1',
      eventType: 'pve',
      accessMode: 'RESTRICTED',
      allowedUserIds: ['allowed_user'],
      roles: [],
      waitlist: []
    });

    await warService.createWar(event);
    await pveService.saveEventSlots(event.id, [{ position: 0, label: '20:00', time: '20:00', capacity: 3 }]);
    const option = (await pveService.getEventSlots(event.id))[0];

    const deniedJoin = await pveService.joinSlot(event.id, option.id, {
      userId: 'restricted_user_denied',
      displayName: 'Denied User',
      userRoleIds: ['role_other']
    });
    expect(deniedJoin.ok).toBe(true);
    expect(deniedJoin.reason).toBe('joined_as_filler');

    const allowedJoin = await pveService.joinSlot(event.id, option.id, {
      userId: 'allowed_user',
      displayName: 'Allowed User',
      userRoleIds: []
    });
    expect(allowedJoin.ok).toBe(true);
    expect(allowedJoin.reason).toBe('joined');

    const view = await pveService.getEventPveView(event);
    expect(view.accessMode).toBe('RESTRICTED');
    expect(view.allowedUserIds).toEqual(['allowed_user']);
    expect(view.options[0].fillers.length).toBe(1);
    expect(view.options[0].fillers[0].displayName).toBe('Denied User');
  });

  it('filler por horario permite multiples horarios y usa toggle en el mismo horario', async () => {
    const event = buildWar({
      id: 'pve_event_restricted_2',
      eventType: 'pve',
      accessMode: 'RESTRICTED',
      allowedUserIds: ['allowed_user'],
      roles: [],
      waitlist: []
    });

    await warService.createWar(event);
    await pveService.saveEventSlots(event.id, [
      { position: 0, label: '20:00', time: '20:00', capacity: 3 },
      { position: 1, label: '21:00', time: '21:00', capacity: 3 }
    ]);
    const options = await pveService.getEventSlots(event.id);
    const optionA = options[0];
    const optionB = options[1];

    const toFillers = await pveService.joinSlot(event.id, optionA.id, {
      userId: 'same_user',
      displayName: 'Same User',
      userRoleIds: []
    });
    expect(toFillers.ok).toBe(true);
    expect(toFillers.reason).toBe('joined_as_filler');

    const secondFillerSlot = await pveService.joinSlot(event.id, optionB.id, {
      userId: 'same_user',
      displayName: 'Same User',
      userRoleIds: []
    });
    expect(secondFillerSlot.ok).toBe(true);
    expect(secondFillerSlot.reason).toBe('joined_as_filler');

    const toggleFillerOff = await pveService.joinSlot(event.id, optionA.id, {
      userId: 'same_user',
      displayName: 'Same User',
      userRoleIds: []
    });
    expect(toggleFillerOff.ok).toBe(true);
    expect(toggleFillerOff.reason).toBe('left');

    const viewAfterToggle = await pveService.getEventPveView(event);
    const slotAAfterToggle = viewAfterToggle.options.find(slot => slot.id === optionA.id);
    const slotBAfterToggle = viewAfterToggle.options.find(slot => slot.id === optionB.id);
    expect(slotAAfterToggle.fillers.some(entry => entry.userId === 'same_user')).toBe(false);
    expect(slotBAfterToggle.fillers.some(entry => entry.userId === 'same_user')).toBe(true);
  });

  it('permite editar acceso PvE (modo y usuarios permitidos)', async () => {
    const event = buildWar({
      id: 'pve_event_access_edit_1',
      eventType: 'pve',
      accessMode: 'OPEN',
      allowedUserIds: [],
      roles: [],
      waitlist: []
    });

    await warService.createWar(event);
    await pveService.configureAccess(event.id, 'RESTRICTED', ['u1', 'u2']);

    const refreshed = warService.loadWars().find(war => war.id === event.id);
    expect(refreshed.accessMode).toBe('RESTRICTED');
    expect(refreshed.allowedUserIds).toEqual(['u1', 'u2']);
  });

  it('permite editar horarios PvE (agregar, editar, reordenar, eliminar)', async () => {
    const event = buildWar({
      id: 'pve_event_slots_edit_1',
      eventType: 'pve',
      roles: [],
      waitlist: []
    });

    await warService.createWar(event);
    await pveService.saveEventSlots(event.id, [{ position: 0, label: '20:00', time: '20:00', capacity: 2 }]);

    await pveService.addSlot(event.id, '21:00', 3);
    let options = await pveService.getEventSlots(event.id);
    expect(options.length).toBe(2);
    expect(options[1].time).toBe('21:00');

    await pveService.editSlot(options[1].id, { time: '21:30', capacity: 4 });
    options = await pveService.getEventSlots(event.id);
    expect(options[1].time).toBe('21:30');
    expect(options[1].capacity).toBe(4);

    await pveService.moveSlot(event.id, options[1].id, 'up');
    options = await pveService.getEventSlots(event.id);
    expect(options[0].time).toBe('21:30');
    expect(options[1].time).toBe('20:00');

    const deleted = await pveService.deleteSlot(event.id, options[1].id);
    expect(deleted).toBe(true);
    options = await pveService.getEventSlots(event.id);
    expect(options.length).toBe(1);
    expect(options[0].time).toBe('21:30');
  });

  it('permite gestion basica de inscritos/fillers (quitar, mover, promover y agregar manual)', async () => {
    const event = buildWar({
      id: 'pve_event_manage_enroll_1',
      eventType: 'pve',
      accessMode: 'RESTRICTED',
      allowedUserIds: ['allowed_user'],
      roles: [],
      waitlist: []
    });

    await warService.createWar(event);
    await pveService.saveEventSlots(event.id, [
      { position: 0, label: '20:00', time: '20:00', capacity: 2 },
      { position: 1, label: '21:00', time: '21:00', capacity: 2 }
    ]);
    let options = await pveService.getEventSlots(event.id);
    const slotA = options[0];
    const slotB = options[1];

    await pveService.joinSlot(event.id, slotA.id, { userId: 'allowed_user', displayName: 'Allowed User' });
    await pveService.joinSlot(event.id, slotA.id, { userId: 'denied_user', displayName: 'Denied User' });

    let moved = await pveService.moveEnrollment(event.id, slotA.id, slotB.id, 'allowed_user');
    expect(moved.ok).toBe(true);

    let promoted = await pveService.promoteFiller(event.id, slotA.id, 'denied_user');
    expect(promoted.ok).toBe(true);

    const removed = await pveService.removeEnrollment(event.id, slotA.id, 'denied_user');
    expect(removed).toBe(true);

    const manual = await pveService.adminAddEnrollment(event.id, slotB.id, {
      userId: 'manual_user',
      displayName: 'Manual User'
    }, 'FILLER');
    expect(manual.ok).toBe(true);

    const view = await pveService.getEventPveView(event);
    const viewSlotB = view.options.find(slot => slot.id === slotB.id);
    expect(viewSlotB.enrollments.some(entry => entry.userId === 'allowed_user')).toBe(true);
    expect(viewSlotB.fillers.some(entry => entry.userId === 'manual_user')).toBe(true);
  });
});
