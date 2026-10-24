const { parseEmojiInput } = require('../../src/utils/emojiHelper');
const { buildWarMessagePayload, buildWarReadOnlyPayload } = require('../../src/utils/warMessageBuilder');
const { buildWar, buildWarRole } = require('../factories/warFactory');

describe('parseEmojiInput exige un solo emoji (C-6)', () => {
  it.each([
    ['✅', 'unicode'],
    ['❤️', 'unicode'],
    ['\u{1F44D}\u{1F3FD}', 'unicode'],
    ['\u{1F468}‍\u{1F469}‍\u{1F467}', 'unicode'],
    ['<:maegu:123456789012345678>', 'custom'],
    ['<a:anim:123456789012345678>', 'custom']
  ])('acepta %s', (input, source) => {
    const parsed = parseEmojiInput(input, null);
    expect(parsed).toEqual({ emoji: input, emojiSource: source });
  });

  it.each([
    ['hola ✅'],
    ['✅ ok'],
    ['✅✅'],
    ['✅ ❤️'],
    ['abc'],
    ['<:maegu:123456789012345678> texto'],
    ['   '],
    ['']
  ])('rechaza %j', input => {
    expect(parseEmojiInput(input, null)).toBeNull();
  });

  it('tolera espacios alrededor de un emoji valido', () => {
    expect(parseEmojiInput('  ✅  ', null)).toEqual({ emoji: '✅', emojiSource: 'unicode' });
  });

  it('marca como guild el emoji custom que existe en el servidor', () => {
    const guild = { emojis: { cache: new Map([['123456789012345678', {}]]) } };
    expect(parseEmojiInput('<:maegu:123456789012345678>', guild).emojiSource).toBe('guild');
  });
});

describe('botones de rol con iconos invalidos persistidos (C-6)', () => {
  function firstButtonEmoji(builder, war) {
    const payload = builder(war);
    return payload.components[0].toJSON().components[0].emoji;
  }

  it('un icono guardado con texto extra cae al circulo blanco en vez de romper el mensaje', () => {
    const war = buildWar({
      roles: [buildWarRole({ name: 'Tank', emoji: 'hola ✅', emojiSource: 'unicode' })]
    });

    expect(firstButtonEmoji(buildWarMessagePayload, war)).toMatchObject({ name: '⚪' });
    expect(firstButtonEmoji(buildWarReadOnlyPayload, war)).toMatchObject({ name: '⚪' });
  });

  it('un icono sin fuente y con texto cae al circulo blanco', () => {
    const war = buildWar({ roles: [buildWarRole({ name: 'Tank', emoji: 'texto', emojiSource: null })] });
    expect(firstButtonEmoji(buildWarMessagePayload, war)).toMatchObject({ name: '⚪' });
  });

  it('los iconos validos (unicode y custom) se conservan', () => {
    const unicodeWar = buildWar({ roles: [buildWarRole({ name: 'A', emoji: '❤️', emojiSource: 'unicode' })] });
    const customWar = buildWar({
      roles: [buildWarRole({ name: 'B', emoji: '<a:anim:123456789012345678>', emojiSource: 'custom' })]
    });

    expect(firstButtonEmoji(buildWarMessagePayload, unicodeWar)).toMatchObject({ name: '❤️' });
    expect(firstButtonEmoji(buildWarMessagePayload, customWar)).toMatchObject({
      name: 'anim',
      id: '123456789012345678',
      animated: true
    });
  });
});
