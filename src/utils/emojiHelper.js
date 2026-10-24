// Un emoji unicode valido para un boton es un unico grafema (incluye ZWJ, tonos de piel y VS16).
function isSingleUnicodeEmoji(text) {
  const value = String(text || '').trim();
  if (!value || !/\p{Extended_Pictographic}/u.test(value)) return false;
  const segments = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value));
  return segments.length === 1;
}

function parseEmojiInput(text, guild) {
  const value = String(text || '').trim();
  if (!value) return null;

  const customEmojiMatch = value.match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/);
  if (customEmojiMatch) {
    const emojiId = customEmojiMatch[1];
    const isGuildEmoji = Boolean(guild?.emojis?.cache?.get(emojiId));
    return {
      emoji: value,
      emojiSource: isGuildEmoji ? 'guild' : 'custom'
    };
  }

  if (isSingleUnicodeEmoji(value)) {
    return {
      emoji: value,
      emojiSource: 'unicode'
    };
  }

  return null;
}

function extractEmojiAndName(text, guild) {
  const value = String(text || '').trim();
  if (!value) return { emoji: null, cleanName: '', emojiSource: null };

  const customEmojiPrefixMatch = value.match(/^(<a?:[A-Za-z0-9_]+:\d+>)\s*(.+)$/);
  if (customEmojiPrefixMatch) {
    const parsedEmoji = parseEmojiInput(customEmojiPrefixMatch[1], guild);
    return {
      emoji: parsedEmoji?.emoji || customEmojiPrefixMatch[1],
      cleanName: customEmojiPrefixMatch[2].trim(),
      emojiSource: parsedEmoji?.emojiSource || 'custom'
    };
  }

  const unicodePrefixMatch = value.match(/^(\p{Extended_Pictographic})\s*(.+)$/u);
  if (unicodePrefixMatch) {
    return {
      emoji: unicodePrefixMatch[1],
      cleanName: unicodePrefixMatch[2].trim(),
      emojiSource: 'unicode'
    };
  }

  return { emoji: null, cleanName: value, emojiSource: null };
}

module.exports = {
  isSingleUnicodeEmoji,
  parseEmojiInput,
  extractEmojiAndName
};
