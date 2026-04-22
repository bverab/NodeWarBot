const { setupIntegrationSuite } = require('../helpers/dbTestHarness');
const warService = require('../../src/services/warService');
const garmothService = require('../../src/services/garmothLinkService');

setupIntegrationSuite();

describe('Persistence Smoke', () => {
  it('inicia capa de persistencia y permite lecturas vacias', () => {
    const wars = warService.loadWars();
    const links = garmothService.loadCharacterLinks();

    expect(Array.isArray(wars)).toBe(true);
    expect(Array.isArray(links)).toBe(true);
    expect(wars.length).toBe(0);
    expect(links.length).toBe(0);
  });
});
