const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const templateService = require('../../src/services/templateService');
const { buildWar, buildWarRole } = require('../factories/warFactory');

setupIntegrationSuite();

describe('TemplateService integration', () => {
  it('crea plantilla desde war y conserva estructura de roles/permisos/menciones', async () => {
    const war = buildWar({
      eventType: 'war',
      roles: [
        buildWarRole({
          name: 'Caller',
          max: 1,
          emoji: '??',
          allowedRoleIds: ['role_a'],
          allowedRoles: ['Caller']
        }),
        buildWarRole({
          name: 'DPS',
          max: 3,
          allowedRoleIds: ['role_b']
        })
      ],
      notifyRoles: ['role_ping_1', 'role_ping_2'],
      timezone: 'America/Santiago',
      time: '21:00',
      duration: 90,
      closeBeforeMinutes: 20
    });

    await warService.createWar(war);
    const source = warService.loadWars().find(entry => entry.id === war.id);

    const template = await templateService.createTemplateFromWar('guild_1', 'war', 'War Base', source);

    expect(template.name).toBe('War Base');
    expect(template.eventType).toBe('war');
    expect(template.roleSlots.length).toBe(2);
    expect(template.roleSlots[0].name).toBe('Caller');
    expect(template.roleSlots[0].allowedRoleIds).toEqual(['role_a']);
    expect(template.notifyTargets).toEqual(['role_ping_1', 'role_ping_2']);
  });

  it('aplica plantilla como draft reutilizable sin inscritos', async () => {
    const war = buildWar({
      eventType: 'siege',
      roles: [
        buildWarRole({ name: 'Frontline', max: 2, users: [{ userId: 'u1', displayName: 'User1' }] })
      ],
      notifyRoles: ['role_siege']
    });

    const template = await templateService.createTemplateFromWar('guild_1', 'siege', 'Siege Base', war);
    const draft = templateService.buildTemplateDraft(template);

    expect(draft.eventType).toBe('siege');
    expect(draft.roles.length).toBe(1);
    expect(draft.roles[0].name).toBe('Frontline');
    expect(draft.roles[0].users).toEqual([]);
    expect(draft.notifyRoles).toEqual(['role_siege']);
  });

  it('lista y archiva plantillas por guild', async () => {
    const war = buildWar({ eventType: 'war' });

    const created = await templateService.createTemplateFromWar('guild_1', 'war', 'ToArchive', war);
    const activeList = await templateService.listTemplatesByGuild('guild_1', { eventType: 'war' });
    expect(activeList.some(template => template.id === created.id)).toBe(true);

    const archived = await templateService.archiveTemplate('guild_1', created.id, true);
    expect(archived).toBeTruthy();
    expect(archived.isArchived).toBe(true);

    const activeAfterArchive = await templateService.listTemplatesByGuild('guild_1', { eventType: 'war' });
    expect(activeAfterArchive.some(template => template.id === created.id)).toBe(false);

    const withArchived = await templateService.listTemplatesByGuild('guild_1', {
      eventType: 'war',
      includeArchived: true
    });
    expect(withArchived.some(template => template.id === created.id)).toBe(true);
  });

  it('actualiza plantilla existente y reemplaza su estructura', async () => {
    const initial = buildWar({
      eventType: 'war',
      type: 'Tipo inicial',
      roles: [
        buildWarRole({ name: 'Caller', max: 1, allowedRoleIds: ['role_old'] })
      ],
      notifyRoles: ['notify_old']
    });
    const next = buildWar({
      eventType: 'war',
      type: 'Tipo nuevo',
      roles: [
        buildWarRole({ name: 'Frontline', max: 2, allowedRoleIds: ['role_new_1'] }),
        buildWarRole({ name: 'Backline', max: 3, allowedRoleIds: ['role_new_2'] })
      ],
      notifyRoles: ['notify_new_1', 'notify_new_2'],
      timezone: 'America/Santiago',
      time: '23:10'
    });

    const created = await templateService.createTemplateFromWar('guild_1', 'war', 'MutableTemplate', initial);
    const updated = await templateService.updateTemplateFromWar('guild_1', created.id, next, {
      name: 'MutableTemplateV2'
    });

    expect(updated).toBeTruthy();
    expect(updated.name).toBe('MutableTemplateV2');
    expect(updated.typeDefault).toBe('Tipo nuevo');
    expect(updated.roleSlots.length).toBe(2);
    expect(updated.roleSlots.map(role => role.name)).toEqual(['Frontline', 'Backline']);
    expect(updated.notifyTargets).toEqual(['notify_new_1', 'notify_new_2']);
  });

  it('permite sobrescribir una plantilla archivada reactivandola', async () => {
    const initial = buildWar({
      eventType: 'war',
      roles: [buildWarRole({ name: 'OldRole', max: 1 })]
    });
    const source = buildWar({
      eventType: 'war',
      roles: [buildWarRole({ name: 'FreshRole', max: 4 })]
    });

    const created = await templateService.createTemplateFromWar('guild_1', 'war', 'OverwriteMe', initial);
    await templateService.archiveTemplate('guild_1', created.id, true);

    const overwritten = await templateService.updateTemplateFromWar('guild_1', created.id, source, {
      unarchive: true
    });

    expect(overwritten).toBeTruthy();
    expect(overwritten.isArchived).toBe(false);
    expect(overwritten.roleSlots.length).toBe(1);
    expect(overwritten.roleSlots[0].name).toBe('FreshRole');
    expect(overwritten.roleSlots[0].max).toBe(4);
  });
});
