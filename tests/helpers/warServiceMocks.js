/**
 * Para tests unitarios que mockean warService.loadWars/updateWar: updateWarById aplica el mutator
 * sobre el evento que devuelve loadWars y "persiste" con el updateWar mockeado, asi las aserciones
 * sobre updateWar siguen viendo el evento ya modificado.
 */
function routeUpdateWarByIdThroughUpdateWar(warService) {
  warService.updateWarById = vi.fn(async (eventId, mutator) => {
    const current = warService.loadWars().find(war => String(war.id) === String(eventId));
    if (!current) return { war: null, result: null };
    const result = mutator(current);
    if (result === false) return { war: null, result };
    return { war: await warService.updateWar(current), result };
  });
  return warService;
}

module.exports = {
  routeUpdateWarByIdThroughUpdateWar
};
