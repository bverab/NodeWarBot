const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const eventManagementService = require('../../src/services/eventManagementService');
const { buildWar } = require('../factories/warFactory');

setupIntegrationSuite();

describe('eventManagementService dashboard-ready operations', () => {
  it('crea evento PvE con slots y devuelve vista dashboard sin Discord Interaction', async () => {
    const event = buildWar({
      id: 'dashboard_event_create_pve_1',
      eventType: 'pve',
      channelId: 'dashboard_channel_1',
      roles: [],
      waitlist: []
    });

    const created = await eventManagementService.createEvent(event, {
      pveSlots: [
        { position: 0, label: '20:00', time: '20:00', capacity: 3 },
        { position: 1, label: '21:00', time: '21:00', capacity: 4 }
      ]
    });

    expect(created.ok).toBe(true);
    expect(created.event.id).toBe(event.id);
    expect(created.pve.options.map(option => option.time)).toEqual(['20:00', '21:00']);
    expect(created.pve.options.map(option => option.capacity)).toEqual([3, 4]);
  });

  it('actualiza estado abierto/cerrado y acceso PvE desde datos planos', async () => {
    const event = buildWar({
      id: 'dashboard_event_update_pve_1',
      eventType: 'pve',
      channelId: 'dashboard_channel_2',
      accessMode: 'OPEN',
      allowedUserIds: [],
      roles: [],
      waitlist: []
    });
    await eventManagementService.createEvent(event, {
      pveSlots: [{ position: 0, label: '20:00', time: '20:00', capacity: 2 }]
    });

    const closed = await eventManagementService.setEventClosed(event.id, true, { channelId: event.channelId });
    expect(closed.ok).toBe(true);
    expect(closed.event.isClosed).toBe(true);

    const access = await eventManagementService.updatePveAllowedUsers(
      event.id,
      'RESTRICTED',
      ['user_a', 'user_b'],
      { channelId: event.channelId }
    );
    expect(access.ok).toBe(true);
    expect(access.event.accessMode).toBe('RESTRICTED');
    expect(access.event.allowedUserIds).toEqual(['user_a', 'user_b']);
  });

  it('gestiona slots, participantes y fillers PvE sin depender de Discord handlers', async () => {
    const event = buildWar({
      id: 'dashboard_event_manage_pve_1',
      eventType: 'pve',
      channelId: 'dashboard_channel_3',
      roles: [],
      waitlist: []
    });
    await eventManagementService.createEvent(event, {
      pveSlots: [{ position: 0, label: '20:00', time: '20:00', capacity: 1 }]
    });

    const slotAdded = await eventManagementService.addPveSlot(event.id, '21:00', 2, { channelId: event.channelId });
    const slotA = slotAdded.pve.options.find(option => option.time === '20:00');
    const slotB = slotAdded.pve.options.find(option => option.time === '21:00');

    const primary = await eventManagementService.addPveEnrollment(event.id, slotA.id, {
      userId: 'primary_user',
      displayName: 'Primary User'
    }, 'PRIMARY', { channelId: event.channelId });
    expect(primary.result.ok).toBe(true);

    const filler = await eventManagementService.addPveEnrollment(event.id, slotA.id, {
      userId: 'filler_user',
      displayName: 'Filler User'
    }, 'FILLER', { channelId: event.channelId });
    expect(filler.result.ok).toBe(true);

    const moved = await eventManagementService.movePveEnrollment(event.id, slotA.id, slotB.id, 'primary_user', {
      channelId: event.channelId
    });
    expect(moved.result.ok).toBe(true);

    const promoted = await eventManagementService.promotePveFiller(event.id, slotA.id, 'filler_user', {
      channelId: event.channelId
    });
    expect(promoted.result.ok).toBe(true);

    const finalView = await eventManagementService.getEventDashboardView(event.id, { channelId: event.channelId });
    const finalSlotA = finalView.pve.options.find(option => option.id === slotA.id);
    const finalSlotB = finalView.pve.options.find(option => option.id === slotB.id);
    expect(finalSlotA.enrollments.some(entry => entry.userId === 'filler_user')).toBe(true);
    expect(finalSlotB.enrollments.some(entry => entry.userId === 'primary_user')).toBe(true);
  });
});
