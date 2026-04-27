vi.mock('../../src/utils/participantDisplayFormatter', () => ({
  createParticipantDisplayFormatter: () => participant => `DEF ${participant.displayName}`
}));

const { buildPveMessagePayload } = require('../../src/utils/pveMessageBuilder');

describe('pveMessageBuilder render', () => {
  it('renderiza sin placeholders y mueve fillers a seccion global', () => {
    const payload = buildPveMessagePayload(
      {
        eventType: 'pve',
        name: 'Boss Night',
        type: 'Kzarka + Kutum',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        closesAt: Date.now() + 1800000,
        isClosed: false,
        accessMode: 'RESTRICTED'
      },
      {
        accessMode: 'RESTRICTED',
        allowedUserIds: ['123'],
        options: [
          {
            id: 'opt1',
            label: '20:00',
            capacity: 3,
            enrollments: [{ displayName: 'Alice' }],
            fillers: [{ displayName: 'Bob' }]
          }
        ]
      }
    );

    const embed = payload.embeds[0].data;
    expect(String(embed.title)).not.toContain('??');
    expect(String(embed.description)).not.toContain('??');
    expect(String(embed.description)).toContain('**Acceso**');
    expect(String(embed.description)).toContain('<@123>');

    const fields = embed.fields || [];
    expect(fields.some(field => String(field.name).includes('20:00'))).toBe(true);
    const slot = fields.find(field => String(field.name).includes('20:00'));
    expect(String(slot.value)).toContain('Alice');
    expect(String(slot.value)).not.toContain('Bob');

    const fillersField = fields.find(field => String(field.name).includes('Fillers'));
    expect(fillersField).toBeTruthy();
    expect(String(fillersField.value)).toContain('20:00 ->');
    expect(String(fillersField.value)).toContain('Bob');
  });

  it('usa bloques inline y corta cada 3 horarios por fila', () => {
    const options = ['20:00', '21:00', '22:00', '23:00'].map((time, index) => ({
      id: `opt_${index}`,
      label: time,
      time,
      capacity: 5,
      enrollments: [],
      fillers: []
    }));

    const payload = buildPveMessagePayload(
      {
        eventType: 'pve',
        name: 'Night Run',
        type: 'Bosses',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        closesAt: Date.now() + 1800000,
        isClosed: false,
        accessMode: 'OPEN'
      },
      {
        accessMode: 'OPEN',
        allowedUserIds: [],
        options
      }
    );

    const fields = payload.embeds[0].data.fields || [];
    const slotFields = fields.filter(field => String(field.name).includes('⏰'));
    const separators = fields.filter(field => String(field.name) === '\u200b');

    expect(slotFields.length).toBe(4);
    expect(slotFields.slice(0, 3).every(field => field.inline === true)).toBe(true);
    expect(separators.length).toBe(1);
  });

  it('oculta seccion global de fillers cuando no hay fillers', () => {
    const payload = buildPveMessagePayload(
      {
        eventType: 'pve',
        name: 'No Fillers',
        type: 'Bosses',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        closesAt: Date.now() + 1800000,
        isClosed: false,
        accessMode: 'OPEN'
      },
      {
        accessMode: 'OPEN',
        allowedUserIds: [],
        options: [
          {
            id: 'opt1',
            label: '20:00',
            time: '20:00',
            capacity: 5,
            enrollments: [{ displayName: 'Alice' }],
            fillers: []
          }
        ]
      }
    );

    const fields = payload.embeds[0].data.fields || [];
    expect(fields.some(field => String(field.name).includes('Fillers'))).toBe(false);
  });

  it('no trunca inscritos en horarios PvE', () => {
    const payload = buildPveMessagePayload(
      {
        eventType: 'pve',
        name: 'Full List',
        type: 'Bosses',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        closesAt: Date.now() + 1800000,
        isClosed: false,
        accessMode: 'OPEN'
      },
      {
        accessMode: 'OPEN',
        allowedUserIds: [],
        options: [
          {
            id: 'opt1',
            label: '20:00',
            time: '20:00',
            capacity: 10,
            enrollments: [
              { displayName: 'Alice' },
              { displayName: 'Bob' },
              { displayName: 'Carl' },
              { displayName: 'Diana' },
              { displayName: 'Erik' }
            ],
            fillers: []
          }
        ]
      }
    );

    const fields = payload.embeds[0].data.fields || [];
    const slot = fields.find(field => String(field.name).includes('20:00'));
    expect(String(slot.value)).toContain('Alice');
    expect(String(slot.value)).toContain('Bob');
    expect(String(slot.value)).toContain('Carl');
    expect(String(slot.value)).toContain('Diana');
    expect(String(slot.value)).toContain('Erik');
    expect(String(slot.value)).not.toContain('+');
    expect(String(slot.value)).not.toContain('mas');
  });
});
