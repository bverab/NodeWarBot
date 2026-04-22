const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const { buildWar, buildWarRole } = require('../factories/warFactory');
const {
  listSeriesWars,
  addSeriesDay,
  addSeriesDays,
  editSeriesDay,
  removeSeriesDay
} = require('../../src/services/recurrenceSeriesService');

setupIntegrationSuite();

describe('recurrenceSeriesService integration', () => {
  it('agrega nuevo dia a la serie sin romper ocurrencias existentes', async () => {
    const base = buildWar({
      groupId: 'series_1',
      id: 'series_1_day1',
      dayOfWeek: 1,
      time: '20:00',
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null },
      roles: [buildWarRole({ name: 'Caller', max: 1 })]
    });
    await warService.createWar(base);

    await addSeriesDay(base, base.channelId, '21:30', 3);
    const series = listSeriesWars(base, base.channelId);

    expect(series.length).toBe(2);
    expect(series.some(w => w.dayOfWeek === 1 && w.time === '20:00')).toBe(true);
    expect(series.some(w => w.dayOfWeek === 3 && w.time === '21:30')).toBe(true);
  });

  it('agrega multiples dias con la misma hora en una sola operacion', async () => {
    const base = buildWar({
      groupId: 'series_multi_1',
      id: 'series_multi_1_day1',
      dayOfWeek: 1,
      time: '19:00',
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(base);

    const result = await addSeriesDays(base, base.channelId, '20:30', '0;3;5');
    const series = listSeriesWars(base, base.channelId);

    expect(result.addedDays).toEqual([0, 3, 5]);
    expect(result.invalidTokens).toEqual([]);
    expect(series.length).toBe(4);
    expect(series.some(w => w.dayOfWeek === 3 && w.time === '20:30')).toBe(true);
    expect(series.some(w => w.dayOfWeek === 5 && w.time === '20:30')).toBe(true);
    expect(series.some(w => w.dayOfWeek === 0 && w.time === '20:30')).toBe(true);
  });

  it('ignora dias duplicados/ya existentes y reporta tokens invalidos', async () => {
    const base = buildWar({
      groupId: 'series_multi_2',
      id: 'series_multi_2_day1',
      dayOfWeek: 1,
      time: '19:00',
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(base);

    const result = await addSeriesDays(base, base.channelId, '21:00', '1; 1; 3; 8; x; 0; 0');
    const series = listSeriesWars(base, base.channelId);

    expect(result.addedDays).toEqual([3, 0]);
    expect(result.ignoredExistingDays).toEqual([1]);
    expect(result.duplicateInputDays).toEqual([1, 0]);
    expect(result.invalidTokens).toEqual(['8', 'x']);
    expect(series.length).toBe(3);
    expect(series.some(w => w.dayOfWeek === 3)).toBe(true);
    expect(series.some(w => w.dayOfWeek === 0)).toBe(true);
  });

  it('edita dia existente sin colapsar toda la serie', async () => {
    const monday = buildWar({
      groupId: 'series_2',
      id: 'series_2_day1',
      dayOfWeek: 1,
      time: '20:00',
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    const wednesday = buildWar({
      groupId: 'series_2',
      id: 'series_2_day3',
      dayOfWeek: 3,
      time: '21:00',
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(monday);
    await warService.createWar(wednesday);

    await editSeriesDay(monday, monday.channelId, 'series_2_day3', '22:15', 4);
    const series = listSeriesWars(monday, monday.channelId);

    expect(series.length).toBe(2);
    expect(series.some(w => w.id === 'series_2_day1' && w.dayOfWeek === 1)).toBe(true);
    expect(series.some(w => w.dayOfWeek === 4 && w.time === '22:15')).toBe(true);
  });

  it('elimina dia de serie respetando regla de no vaciarla', async () => {
    const one = buildWar({
      groupId: 'series_3',
      id: 'series_3_day1',
      dayOfWeek: 1,
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    const two = buildWar({
      groupId: 'series_3',
      id: 'series_3_day2',
      dayOfWeek: 2,
      schedule: { enabled: true, mode: 'recurring', lastCreatedAt: null, lastMessageIdDeleted: null }
    });
    await warService.createWar(one);
    await warService.createWar(two);

    const removed = await removeSeriesDay(one, one.channelId, two.id);
    expect(removed.id).toBe(two.id);

    const remaining = listSeriesWars(one, one.channelId);
    expect(remaining.length).toBe(1);
    await expect(removeSeriesDay(one, one.channelId, one.id)).rejects.toThrow('ultimo dia');
  });
});
