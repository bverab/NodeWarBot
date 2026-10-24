// The bot trims role/slot names to 60 characters whenever it rewrites an event (normalizeRole in warState.js). The dashboard
// must not store anything longer: it would be cut there, and two names sharing their first 60 characters would then
// collide on @@unique([eventId, name]) and block the bot's close/expire writes.
export const MAX_SLOT_NAME_LENGTH = 60;

export const SLOT_NAME_TOO_LONG_MESSAGE = `Slot name must be ${MAX_SLOT_NAME_LENGTH} characters or fewer.`;
