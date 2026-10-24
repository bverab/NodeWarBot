const { resetSrcModules, requireSrc } = require('../support/interaction/freshRequire');
const { createInteraction, createModalFields } = require('../support/interaction/fakes');

describe('crear un borrador nuevo descarta el estado del anterior (H-18)', () => {
  let modalHandler;
  let draftStore;

  beforeEach(() => {
    resetSrcModules();
    global.warEdits = {};
    global.warEditSelections = {};
    global.warScheduleTemp = {};
    global.warPanelPending = {};
    modalHandler = requireSrc('src/handlers/modalHandler');
    draftStore = requireSrc('src/utils/draftSessionStore');
  });

  afterEach(() => {
    delete global.warEdits;
    delete global.warEditSelections;
    delete global.warScheduleTemp;
    delete global.warPanelPending;
  });

  function buildCreationModal(customId = 'create_event_initial:war') {
    return createInteraction({
      customId,
      isModalSubmit: () => true,
      fields: createModalFields({
        war_name_input: 'Evento Nuevo',
        war_type_input: '',
        war_timezone_input: '',
        war_time_input: '22:00',
        war_duration_input: '70/10'
      })
    });
  }

  it('no hereda dias, menciones ni seleccion del borrador abandonado', async () => {
    global.warEdits.user_1 = { creatorId: 'user_1', name: 'Viejo', roles: [{ name: 'Viejo', max: 1, users: [] }] };
    global.warEditSelections.user_1 = 2;
    global.warScheduleTemp.user_1 = { mode: 'recurring', days: [1, 3], mentions: ['role_viejo'] };
    global.warPanelPending.user_1 = { permissionIds: ['x'], icon: null, botIconPage: 3 };

    await modalHandler(buildCreationModal());

    expect(draftStore.getScheduleTemp('user_1')).toBeNull();
    expect(global.warEditSelections.user_1).toBeUndefined();
    expect(global.warPanelPending.user_1).toBeUndefined();
    const draft = draftStore.getDraftWar('user_1');
    expect(draft.name).toBe('Evento Nuevo');
    expect(draft.roles).toEqual([]);
  });

  it('crear sin borrador previo sigue funcionando', async () => {
    await modalHandler(buildCreationModal());

    expect(draftStore.getDraftWar('user_1')?.name).toBe('Evento Nuevo');
  });
});
