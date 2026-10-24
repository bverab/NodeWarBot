const { freshRequire } = require('../support/interaction/freshRequire');

describe('cronHelper (interaction)', () => {
  function loadCronHelper() {
    return freshRequire('src/utils/cronHelper');
  }

  describe('shouldExecute a medianoche (C-10)', () => {
    const midnightThirty = new Date('2026-03-10T00:30:00Z'); // martes

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('ejecuta a las 00:30 del dia correcto', () => {
      const { shouldExecute } = loadCronHelper();

      expect(shouldExecute(2, '00:30', midnightThirty, 'UTC')).toBe(true);
      expect(shouldExecute(2, '00:31', midnightThirty, 'UTC')).toBe(false);
      expect(shouldExecute(3, '00:30', midnightThirty, 'UTC')).toBe(false);
    });

    it('no depende de que el motor ICU devuelva "24" con hour12:false', () => {
      // Simula motores donde { hour12: false } formatea la medianoche como "24".
      const RealDateTimeFormat = Intl.DateTimeFormat;
      vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locale, options = {}) {
        const real = new RealDateTimeFormat(locale, options);
        return {
          formatToParts(date) {
            const parts = real.formatToParts(date);
            if (options.hour12 === false && options.hourCycle === undefined) {
              return parts.map(part => (part.type === 'hour' && part.value === '00' ? { ...part, value: '24' } : part));
            }
            return parts;
          },
          resolvedOptions: () => real.resolvedOptions()
        };
      });
      const { shouldExecute } = loadCronHelper();

      expect(shouldExecute(2, '00:30', midnightThirty, 'UTC')).toBe(true);
    });
  });

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
