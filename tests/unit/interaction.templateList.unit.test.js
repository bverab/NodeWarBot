const { handleEventTemplate } = require('../../src/commands/event/eventTemplate');
const { buildLimitedList } = require('../../src/utils/listFormatting');

function buildTemplates(count, nameLength = 50) {
  return Array.from({ length: count }, (_, index) => ({
    id: `tpl_${String(index).padStart(3, '0')}_${'x'.repeat(24)}`,
    name: `${index}`.padEnd(nameLength, 'N'),
    eventType: 'war',
    roleSlots: [{}, {}, {}],
    isArchived: index % 2 === 0
  }));
}

async function runList(templates) {
  const reply = vi.fn(async () => true);
  const interaction = {
    guildId: 'guild_1',
    options: { getString: () => null, getBoolean: () => false }
  };
  await handleEventTemplate(interaction, 'list', {
    isAdminExecutor: () => true,
    safeEphemeralReply: reply,
    templateService: { listTemplatesByGuild: vi.fn(async () => templates) },
    warService: {},
    getSanitizedOption: () => ''
  });
  return reply.mock.calls[0][1];
}

describe('/event template list respeta el limite de 2000 caracteres (C-14)', () => {
  it('30 plantillas con nombre largo producen una respuesta <= 2000 con "y N mas"', async () => {
    const content = await runList(buildTemplates(30));

    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content.startsWith('Plantillas (30):')).toBe(true);
    expect(content).toMatch(/y \d+ m[aá]s/);
    const shown = content.split('\n').filter(line => line.startsWith('•')).length;
    const hidden = Number(content.match(/y (\d+) m[aá]s/)[1]);
    expect(shown + hidden).toBe(30);
  });

  it('con pocas plantillas la respuesta queda igual que antes (sin pie)', async () => {
    const content = await runList(buildTemplates(3, 10));

    expect(content.split('\n')).toHaveLength(4);
    expect(content).not.toMatch(/ m[aá]s/);
    expect(content.length).toBeLessThanOrEqual(2000);
  });

  it('mantiene el tope previo de 20 filas aunque quepan mas', async () => {
    const content = await runList(buildTemplates(25, 1));

    const shown = content.split('\n').filter(line => line.startsWith('•')).length;
    expect(shown).toBe(20);
    expect(content).toMatch(/y 5 m[aá]s/);
  });
});

describe('buildLimitedList', () => {
  it('no recorta lo que cabe', () => {
    expect(buildLimitedList('Titulo:', ['a', 'b'], { total: 2 })).toBe('Titulo:\na\nb');
  });

  it('recorta por longitud y agrega el pie con el resto', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `linea-${i}-${'z'.repeat(40)}`);
    const text = buildLimitedList('Titulo:', lines, { total: 10, maxLength: 200 });

    expect(text.length).toBeLessThanOrEqual(200);
    const kept = text.split('\n').filter(line => line.startsWith('linea-')).length;
    expect(text).toContain(`y ${10 - kept} m`);
  });

  it('cuenta como ocultas las filas que no se pasaron (total mayor que lines)', () => {
    const text = buildLimitedList('Titulo:', ['a', 'b'], { total: 5 });
    expect(text).toContain('y 3 m');
  });

  it('recorta la primera fila si ni siquiera esa cabe', () => {
    const text = buildLimitedList('T:', ['y'.repeat(500)], { total: 1, maxLength: 100 });
    expect(text.length).toBeLessThanOrEqual(100);
  });
});
