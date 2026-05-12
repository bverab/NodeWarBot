const { handleScheduleView } = require('../../src/commands/event/eventAdmin');

describe('event schedule admin command', () => {
  it('reads fresh events and shows pending scheduled web publish drafts', async () => {
    const safeEphemeralReply = vi.fn();
    const warService = {
      loadWarsFresh: vi.fn(async () => [
        {
          id: 'web_scheduled_1',
          name: 'Web Scheduled',
          channelId: 'channel_1',
          autoPublishEnabled: true,
          scheduledPublishAt: Date.parse('2026-05-05T22:00:00.000Z'),
          messageId: null,
          time: '23:00',
          timezone: 'America/Santiago',
          schedule: { enabled: false }
        }
      ]),
      loadWars: vi.fn()
    };

    await handleScheduleView({ channelId: 'channel_1' }, { warService, safeEphemeralReply });

    expect(warService.loadWarsFresh).toHaveBeenCalled();
    expect(safeEphemeralReply.mock.calls[0][1]).toContain('Scheduled publish pending');
    expect(safeEphemeralReply.mock.calls[0][1]).toContain('web_scheduled_1');
  });
});
