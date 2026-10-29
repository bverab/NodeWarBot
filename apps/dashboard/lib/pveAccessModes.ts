// PvE event-level access modes, as the bot applies them (src/services/pveAccessRules.js).
// Client-safe: labels and help text for the dashboard forms.
export const PVE_ACCESS_MODES = ["OPEN", "ROLES", "USERS"] as const;

export type PveAccessMode = (typeof PVE_ACCESS_MODES)[number];

export const MAX_PVE_ACCESS_ENTRIES = 25;

export const PVE_ACCESS_MODE_TEXT: Record<PveAccessMode, { label: string; help: string }> = {
  OPEN: {
    label: "Open",
    help: "Anyone who picks a time joins as a main signup."
  },
  ROLES: {
    label: "By roles",
    help: "Members with any of these roles join as main signups and the roles are mentioned on publish. Everyone else is added as a filler (waitlist)."
  },
  USERS: {
    label: "By people",
    help: "Only these people join as main signups and they are mentioned on publish. Everyone else is added as a filler (waitlist)."
  }
};

export const PVE_FILLER_RULE =
  "If no time option is full when signups close, fillers complete the earliest option they can fill, in signup order.";

// "RESTRICTED" is the bot's former name for USERS.
export function normalizePveAccessMode(value: unknown): PveAccessMode {
  const mode = String(value ?? "OPEN").toUpperCase();
  if (mode === "RESTRICTED") {
    return "USERS";
  }
  return (PVE_ACCESS_MODES as readonly string[]).includes(mode) ? (mode as PveAccessMode) : "OPEN";
}
