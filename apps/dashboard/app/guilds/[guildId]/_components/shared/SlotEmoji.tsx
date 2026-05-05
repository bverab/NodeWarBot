import { parseDiscordEmoji } from "@/lib/discordEmoji";
import styles from "@/app/guilds/[guildId]/_styles/overview.module.css";

export function SlotEmoji({ value }: { value?: string | null }) {
  if (!value) {
    return null;
  }

  const parsed = parseDiscordEmoji(value);

  if (parsed) {
    return <img alt={parsed.name} className={styles.slotEmoji} src={parsed.imageUrl} />;
  }

  return <span className={styles.slotEmojiText}>{value}</span>;
}
