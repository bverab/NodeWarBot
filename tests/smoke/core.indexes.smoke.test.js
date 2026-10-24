const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const { prisma } = require('../../src/db/client');

setupIntegrationSuite();

async function indexNames(table) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA index_list("${table}")`);
  return rows.map(row => row.name);
}

async function queryPlan(sql) {
  const rows = await prisma.$queryRawUnsafe(`EXPLAIN QUERY PLAN ${sql}`);
  return rows.map(row => row.detail).join(' | ');
}

describe('core: indices de eventos', () => {
  it('el listado del dashboard por guild y tipo usa el indice (guildId, eventType)', async () => {
    const plan = await queryPlan(
      `SELECT "id" FROM "Event" WHERE "guildId" = 'guild_1' AND "eventType" = 'war' ORDER BY "isClosed" ASC, "closesAt" ASC, "createdAt" DESC`
    );

    expect(await indexNames('Event')).toContain('Event_guildId_eventType_idx');
    expect(plan).toContain('Event_guildId_eventType_idx');
  });

  it('no quedan indices duplicados por restricciones unicas', async () => {
    expect(await indexNames('Event')).not.toContain('Event_messageId_idx');
    expect(await indexNames('EventRoleSlot')).not.toContain('EventRoleSlot_eventId_position_idx');
    expect(await indexNames('EventWaitlistEntry')).not.toContain('EventWaitlistEntry_eventId_position_idx');
    expect(await indexNames('EventTemplateRoleSlot')).not.toContain('EventTemplateRoleSlot_templateId_position_idx');
    expect(await indexNames('EventParticipant')).not.toContain('EventParticipant_eventId_idx');
    expect(await indexNames('GarmothProfile')).not.toContain('GarmothProfile_guildId_idx');

    // Las busquedas siguen cubiertas por los indices unicos.
    expect(await queryPlan(`SELECT "id" FROM "Event" WHERE "messageId" = 'msg_1'`)).toContain('Event_messageId_key');
    expect(await queryPlan(`SELECT "id" FROM "EventParticipant" WHERE "eventId" = 'event_1'`)).toContain('EventParticipant_eventId_userId_key');
  });
});
