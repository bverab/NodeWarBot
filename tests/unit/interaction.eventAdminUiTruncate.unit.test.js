const {
  buildEventSelectorPayload,
  buildEventRolesEditorPayload,
  buildPveSlotsEditorPayload
} = require('../../src/utils/eventAdminUi');
const { buildWar, buildWarRole } = require('../factories/warFactory');

function selectOptions(payload) {
  return payload.components[0].toJSON().components[0].options;
}

describe('eventAdminUi truncate (limites de Discord)', () => {
  it('el selector de eventos no lanza con nombres de 90 caracteres y respeta 100', () => {
    const wars = [
      buildWar({ id: 'w1', name: 'N'.repeat(90) }),
      buildWar({ id: 'w2', name: 'M'.repeat(200) })
    ];

    let payload;
    expect(() => {
      payload = buildEventSelectorPayload(wars);
    }).not.toThrow();

    for (const option of selectOptions(payload)) {
      expect(option.label.length).toBeLessThanOrEqual(100);
      expect(option.description.length).toBeLessThanOrEqual(100);
    }
  });

  it('el selector conserva el texto completo cuando cabe y marca el recorte con "..."', () => {
    const [short, long] = selectOptions(buildEventSelectorPayload([
      buildWar({ id: 'w1', name: 'Corto', createdAt: 2 }),
      buildWar({ id: 'w2', name: 'L'.repeat(150), createdAt: 1 })
    ]));

    expect(short.label).toBe('Corto - Recurrente');
    expect(long.label).toHaveLength(100);
    expect(long.label.endsWith('...')).toBe(true);
  });

  it('el editor de roles recorta nombres largos y avisos largos sin lanzar', () => {
    const war = buildWar({
      name: 'W'.repeat(90),
      roles: [buildWarRole({ name: 'R'.repeat(120), max: 5 })]
    });

    let payload;
    expect(() => {
      payload = buildEventRolesEditorPayload(war, 0, 'n'.repeat(3000));
    }).not.toThrow();

    const roleMenu = payload.components[0].toJSON().components[0];
    expect(roleMenu.options[0].label.length).toBeLessThanOrEqual(100);
    const embed = payload.embeds[0].toJSON();
    for (const field of embed.fields) {
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
  });

  it('el editor de horarios PvE recorta el aviso a 1024', () => {
    const war = buildWar({ name: 'P'.repeat(80) });
    const view = { options: [{ id: 'o1', time: '20:00', capacity: 5, enrollments: [], fillers: [] }] };

    const payload = buildPveSlotsEditorPayload(war, view, { notice: 'n'.repeat(3000) });

    for (const field of payload.embeds[0].toJSON().fields) {
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
  });
});
