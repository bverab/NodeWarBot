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

  if (/\p{Extended_Pictographic}/u.test(value)) {
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
  parseEmojiInput,
  extractEmojiAndName
};
