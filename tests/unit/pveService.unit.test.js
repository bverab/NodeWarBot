const { parsePveSlotsInput } = require('../../src/services/pveService');

describe('pveService parsePveSlotsInput', () => {
  it('parsea horarios unicos y cupo comun', () => {
    const parsed = parsePveSlotsInput('20:00;21:30;20:00', '4');
    expect(parsed.slotCapacity).toBe(4);
    expect(parsed.timeSlots.map(slot => slot.time)).toEqual(['20:00', '21:30']);
    expect(parsed.timeSlots.every(slot => slot.capacity === 4)).toBe(true);
  });

  it('rechaza horario invalido', () => {
    expect(() => parsePveSlotsInput('25:00;21:30', '4')).toThrow(/Horario invalido/);
  });
});
