const { freshRequire } = require('../support/interaction/freshRequire');

describe('cronHelper (interaction)', () => {
  function loadCronHelper() {
    return freshRequire('src/utils/cronHelper');
  }

  describe('normalizeTimeZoneInfo', () => {
    it('no marca America/Bogota como fallback en llamadas repetidas', () => {
      const { normalizeTimeZoneInfo } = loadCronHelper();

      const first = normalizeTimeZoneInfo('America/Bogota');
      const second = normalizeTimeZoneInfo('America/Bogota');
      const third = normalizeTimeZoneInfo('america/bogota');

      expect(first).toEqual({ timezone: 'America/Bogota', source: 'alias' });
      expect(second.timezone).toBe('America/Bogota');
      expect(second.source).not.toBe('fallback');
      expect(third.source).not.toBe('fallback');
    });

    it('mantiene fallback para zonas invalidas en todas las llamadas', () => {
      const { normalizeTimeZoneInfo } = loadCronHelper();

      expect(normalizeTimeZoneInfo('Foo/Bar')).toEqual({ timezone: 'America/Bogota', source: 'fallback' });
      expect(normalizeTimeZoneInfo('Foo/Bar')).toEqual({ timezone: 'America/Bogota', source: 'fallback' });
    });

    it('mantiene la fuente de zonas validas desde la cache', () => {
      const { normalizeTimeZoneInfo } = loadCronHelper();

      const first = normalizeTimeZoneInfo('America/Santiago');
      const second = normalizeTimeZoneInfo('America/Santiago');
      expect(second).toEqual(first);
      expect(second.source).not.toBe('fallback');
    });

    it('acota el tamano de la cache sin romper los resultados', () => {
      const { normalizeTimeZoneInfo } = loadCronHelper();

      for (let i = 0; i < 1000; i += 1) {
        expect(normalizeTimeZoneInfo(`Invalid/Zone_${i}`).source).toBe('fallback');
      }
      expect(normalizeTimeZoneInfo('America/Bogota').source).not.toBe('fallback');
      expect(normalizeTimeZoneInfo('Europe/Madrid')).toEqual({ timezone: 'Europe/Madrid', source: 'exact' });
    });

    it('no permite mutar la cache a traves del resultado devuelto', () => {
      const { normalizeTimeZoneInfo } = loadCronHelper();

      const first = normalizeTimeZoneInfo('Europe/Madrid');
      first.source = 'fallback';
      expect(normalizeTimeZoneInfo('Europe/Madrid').source).toBe('exact');
    });
  });
});
