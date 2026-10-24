const { isSingleUnicodeEmoji, parseEmojiInput } = require('../../src/utils/emojiHelper');
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

  it.each([
    ['bandera (par de indicadores regionales)', '\u{1F1E8}\u{1F1F1}'],
    ['otra bandera', '\u{1F1FA}\u{1F1F8}'],
    ['keycap 1 con VS16', '1️⃣'],
    ['keycap # con VS16', '#️⃣'],
    ['keycap * con VS16', '*️⃣'],
    ['keycap 0 con VS16', '0️⃣'],
    ['keycap 9 sin VS16', '9⃣']
  ])('acepta %s', (_label, input) => {
    expect(parseEmojiInput(input, null)).toEqual({ emoji: input, emojiSource: 'unicode' });
    expect(isSingleUnicodeEmoji(input)).toBe(true);
  });

  it.each([
    ['bandera con texto', '\u{1F1E8}\u{1F1F1}x'],
    ['texto antes de la bandera', 'x\u{1F1E8}\u{1F1F1}'],
    ['indicador regional suelto', '\u{1F1E8}'],
    ['tres indicadores regionales', '\u{1F1E8}\u{1F1F1}\u{1F1FA}'],
    ['dos banderas', '\u{1F1E8}\u{1F1F1}\u{1F1FA}\u{1F1F8}'],
    ['bandera y emoji', '\u{1F1E8}\u{1F1F1}✅'],
    ['keycap con texto', 'hola 1️⃣'],
    ['keycap seguido de texto', '1️⃣x'],
    ['dos keycaps', '1️⃣2️⃣'],
    ['keycap y emoji', '1️⃣✅'],
    ['digito suelto', '1'],
    ['almohadilla suelta', '#'],
    ['asterisco suelto', '*'],
    ['letra con marca de keycap', 'a️⃣'],
    ['dos digitos con marca de keycap', '12⃣'],
    ['marca de keycap suelta', '⃣']
  ])('rechaza %s', (_label, input) => {
    expect(parseEmojiInput(input, null)).toBeNull();
    expect(isSingleUnicodeEmoji(input)).toBe(false);
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

  it.each([
    ['bandera', '\u{1F1E8}\u{1F1F1}'],
    ['keycap con VS16', '1️⃣'],
    ['keycap #', '#️⃣']
  ])('un rol existente con %s conserva su icono en los botones (no cae al circulo blanco)', (_label, emoji) => {
    const war = buildWar({ roles: [buildWarRole({ name: 'Tank', emoji, emojiSource: 'unicode' })] });

    expect(firstButtonEmoji(buildWarMessagePayload, war)).toMatchObject({ name: emoji });
    expect(firstButtonEmoji(buildWarReadOnlyPayload, war)).toMatchObject({ name: emoji });
  });

  it('un icono con texto pegado a una bandera sigue cayendo al circulo blanco', () => {
    const war = buildWar({ roles: [buildWarRole({ name: 'Tank', emoji: '\u{1F1E8}\u{1F1F1}x', emojiSource: 'unicode' })] });

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
