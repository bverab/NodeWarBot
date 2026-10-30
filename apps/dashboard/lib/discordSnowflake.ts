// Discord ids (snowflakes) are 17-20 digit numeric strings. Anything else must never reach a REST path.
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export function isDiscordSnowflake(value: unknown): value is string {
  return typeof value === "string" && DISCORD_SNOWFLAKE_PATTERN.test(value);
}
