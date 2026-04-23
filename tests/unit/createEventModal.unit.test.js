const { showCreateEventModal, getCreateEventModalCustomId } = require('../../src/utils/createEventModal');

describe('createEventModal', () => {
  it('incluye templateId en customId cuando aplica plantilla', () => {
    const customId = getCreateEventModalCustomId('war', 'tpl_123');
    expect(customId).toBe('create_event_initial:war:tpl_123');
  });

  it('prellena campos usando defaults de plantilla', async () => {
    const interaction = {
      showModal: vi.fn(async () => null)
    };

    await showCreateEventModal(interaction, 'war', {
      template: {
        id: 'tpl_1',
        typeDefault: 'War T2',
        timezone: 'America/Santiago',
        time: '22:00',
        duration: 90,
        closeBeforeMinutes: 30
      }
    });

    const modal = interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe('create_event_initial:war:tpl_1');

    const typeInput = modal.components[1].components[0];
    const timezoneInput = modal.components[2].components[0];
    const timeInput = modal.components[3].components[0];
    const durationInput = modal.components[4].components[0];

    expect(typeInput.value).toBe('War T2');
    expect(timezoneInput.value).toBe('America/Santiago');
    expect(timeInput.value).toBe('22:00');
    expect(durationInput.value).toBe('90/30');
  });
});
