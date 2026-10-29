import "server-only";
import { createRequire } from "node:module";

const requireNodeWarBot = createRequire(import.meta.url);

type AccessEvent = {
  eventType?: string | null;
  accessMode?: string | null;
  allowedUserIds?: string[];
  allowedRoleIds?: string[];
  notifyRoles?: string[];
};

type PublicationMentions = {
  targetType: "users" | "roles";
  targets: string[];
  content: string;
  allowedMentions: { parse: string[]; users?: string[]; roles?: string[] };
};

// The bot's own (pure) access rules, so the dashboard mentions exactly what the bot would.
const pveAccessRules = requireNodeWarBot("../../../../src/services/pveAccessRules.js") as {
  buildPublicationMentions(event: AccessEvent, fallbackContent: string): PublicationMentions;
};

export const buildPublicationMentions = pveAccessRules.buildPublicationMentions;
