const { parseSeriesDaysInput } = require('../../src/services/recurrenceSeriesService');

describe('recurrenceSeriesService parseSeriesDaysInput', () => {
  it('parsea dias separados por ; con espacios opcionales y deduplica', () => {
    const result = parseSeriesDaysInput('0; 2;4; 6; 2');
    expect(result.days).toEqual([0, 2, 4, 6]);
    expect(result.invalidTokens).toEqual([]);
    expect(result.duplicateInputDays).toEqual([2]);
  });

  it('rechaza tokens invalidos y rango fuera de 0-6', () => {
    const result = parseSeriesDaysInput('-1;7;foo;2');
    expect(result.days).toEqual([2]);
    expect(result.invalidTokens).toEqual(['-1', '7', 'foo']);
  });
});
