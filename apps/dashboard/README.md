# Spectre Dashboard

Next.js dashboard for NodeWarBot. It lives in the same pnpm workspace as the bot and works on the
**same SQLite database** (through the shared Prisma client), so events, templates and signups are the
same ones the bot publishes in Discord.

## Stack

- Next.js 15 App Router + React 18
- TypeScript
- Auth.js / NextAuth v4 (Discord provider, optional Google provider)
- Prisma (the bot's client, `prisma/schema.prisma` in the repository root)
- CSS-based Spectre visual system

## Install Dependencies

From the repository root:

```bash
pnpm install
pnpm db:generate
```

`pnpm install` installs the bot and the dashboard together. `pnpm db:generate` is
required because the dashboard reads the bot's database through the shared Prisma
client, and dependency install scripts are disabled (see the root README).

## Environment Variables

Copy [`.env.example`](.env.example) to `apps/dashboard/.env.local` (Next.js reads the `.env*` files of
this folder, not the ones in the repository root) and fill it in.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | yes | Discord OAuth application (scopes `identify guilds`). |
| `DISCORD_BOT_TOKEN` | yes | Bot token, server-side only. Used to know which servers the bot is in, to read channels, members and emojis, and to publish events. If missing, `TOKEN` from the environment is used. |
| `NEXTAUTH_SECRET` | yes | Signs the session and the verified-guilds cookie. |
| `NEXTAUTH_URL` | yes | Public URL of the dashboard; it must match the Discord redirect URI exactly. |
| `DATABASE_URL` | yes | The same SQLite file the bot uses (relative paths resolve from `prisma/schema.prisma`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in. It identifies the person but gives **no access to any server** (see the authorization model). |
| `NEXT_PUBLIC_DISCORD_BOT_INVITE_URL`, `NEXT_PUBLIC_DISCORD_CLIENT_ID` | no | Invite link shown when the user has no server with Spectre installed. |
| `DISCORD_APPLICATION_ID` | no | Application ID used to read the bot's application emojis. Falls back to `DISCORD_CLIENT_ID`, `NEXT_PUBLIC_DISCORD_CLIENT_ID` or `CLIENT_ID`. |
| `DASHBOARD_ADMIN_USERNAME`, `DASHBOARD_ADMIN_PASSWORD_HASH` | no | **Local testing only.** Enables a username/password sign-in (the classic form on `/login`) that manages **every** server the bot is in, without Discord OAuth. Never active in production builds (`next start`). Create the hash with `pnpm dashboard:admin-password "<password>"` (format `scrypt:<salt>:<hash>`; `$` is avoided because Next.js expands `$NAME` in `.env` files). |

Notes:
- The Discord Developer Portal must include `http://localhost:3000/api/auth/callback/discord` (adapt host and port to `NEXTAUTH_URL`).
- Without `NEXTAUTH_SECRET` (nor `AUTH_SECRET`/`DISCORD_CLIENT_SECRET`) the verified-guilds cookie is
  **disabled in production**; in development an insecure built-in secret is used and a warning is logged.
- `next build` does not need any of these variables.
- The Discord provider declares `issuer: "https://discord.com"`: Discord adds `iss` to the OAuth callback
  (RFC 9207) and NextAuth v4 rejects the callback ("issuer must be configured on the issuer") without it.
- The local admin session has no Discord user: events it creates have `creatorId = "local-admin"`, so the
  creator-only buttons in Discord (delete, toggle) are not available to anyone for those events; Discord
  admins still manage them from the admin panel.

## Run Locally

From the repository root:

```bash
pnpm dashboard:dev      # development server on http://localhost:3000
pnpm dashboard:build    # production build
pnpm --filter @spectre/dashboard start   # serve the production build
pnpm typecheck          # tsc --noEmit for the dashboard
pnpm lint               # ESLint (rules are warnings for now)
```

Pages to try: `/`, `/login`, `/guilds`, and `/guilds?preview=1` for the UI-only preview.

## Authorization Model

All access control is enforced on the server, in route handlers and server components, never in the UI.

1. **Session.** NextAuth keeps a JWT session. The Discord provider stores the user's Discord access
   token and ID, and the sign-in provider (`session.provider`). A **Google session is always rejected**
   by the guild guards, because it carries no Discord token and so can prove nothing about a server.
   (Sessions issued before the provider was stored have no `provider` and are accepted as Discord ones.)
2. **`requireDashboardGuild(guildId)`** (`lib/server/guildAccess.ts`) is the guard of every read route
   under `/api/guilds/[guildId]`. It requires a Discord session and that the server is in the
   intersection of *"servers the user belongs to"* (Discord, with the user's token) and *"servers where
   the bot is installed"* (Discord, with the bot token). Failures: `401` (no or invalid session),
   `404` (not a shared server), `503` (Discord verification temporarily unavailable).
3. **`requireManageableDashboardGuild(guildId)`** adds `manageable`, computed on the server from the
   Discord permission bits (server owner, `Administrator` or `Manage Server`). Every route that
   writes uses this guard and answers `403` otherwise.
4. **Every query filters by the `guildId` of the URL** (and by `eventId`/`templateId` inside that
   server), so a user cannot reach data of a server they do not manage.
5. **Verified-guilds cookie** (`spectre_verified_guilds`). To avoid asking Discord on every request, the
   verified server list is cached for 5 minutes in an HttpOnly, `SameSite=Lax` cookie signed with
   HMAC-SHA256 (compared in constant time). The signed payload includes the **user ID**: a cookie
   issued to someone else is ignored. A cookie is only issued from data fetched from Discord, never
   renewed from its own contents, so it cannot be extended forever. It is not deleted on sign-out; it
   simply expires and is useless to any other user.
6. `lib/apiGuards.ts` only offers `requireSession` and `getSessionUserId`. The former
   `requireGuildAdmin` placeholder was dead code and has been removed.

## Pages

- `/` – landing page.
- `/login` – sign-in (Discord, and Google when configured).
- `/guilds` – servers where Spectre is installed. `/guilds?preview=1` is a clearly labeled preview with local UI data only.
- `/guilds/[guildId]` – server overview.
- `/guilds/[guildId]/events`, `/events/new`, `/events/[eventId]` – list, create draft and detail/edit of events.
- `/guilds/[guildId]/pve-events` – PvE events.
- `/guilds/[guildId]/templates`, `/templates/new`, `/templates/[templateId]` – event templates.
- `/guilds/[guildId]/schedules`, `/analytics`, `/event-stats`, `/class-stats`, `/garmoth`, `/settings` – read-only or informational modules.
- `/profile`, `/settings` – account placeholders.
- Legacy routes (`/events`, `/templates`, `/signup-roles`, `/class-slots`, `/permissions`, ...) redirect to `/guilds` or to the related guild module, so bot data always needs a server context.
- `error.tsx`, `global-error.tsx`, `not-found.tsx` and `guilds/[guildId]/loading.tsx` provide the error, 404 and loading states.

## API Surface

27 route files under `app/api`. "Read" routes use `requireDashboardGuild`; "manage" routes use
`requireManageableDashboardGuild`. All bodies must be a JSON object (`400` otherwise).

**Session only (no server context)**

| Route | Description |
| --- | --- |
| `GET/POST /api/auth/[...nextauth]` | Auth.js endpoints. |
| `GET /api/guilds` | Servers shared by the user and the bot, with `owner`, `permissions` and `manageable`. The bot's server list is fetched with pagination and cached for 60 s. |
| `GET /api/application-emojis` | Application emojis of the bot. |

**Read (`/api/guilds/[guildId]/...`)**

| Route | Description |
| --- | --- |
| `GET overview` | Counts of events, participants, templates, schedules and Garmoth profiles. |
| `GET events`, `GET events/[eventId]` | Event list (open events first by nearest signup deadline, then closed events, most recent first) and detail (slots, participants, waitlist, PvE enrollments, fillers). Member display names come from Discord through a 5 minute cache with at most 5 concurrent lookups. |
| `GET templates`, `GET templates/[templateId]` | Templates and their slots. |
| `GET schedules`, `GET garmoth`, `GET roles`, `GET channels`, `GET emojis` | Read-only module data, Discord roles, postable channels and server emojis. |

**Manage (`/api/guilds/[guildId]/...`)**

| Route | Description |
| --- | --- |
| `POST events` | Creates a draft event (single or weekly series). |
| `PATCH events/[eventId]` | Edits an event. Once an event is published, schedule, channel and message fields are locked. |
| `POST events/[eventId]/close`, `reopen` | Toggles `Event.isClosed`. |
| `POST events/[eventId]/publish` | Publishes the event to Discord. `409` if it is already published, closed, ended or past its signup deadline. |
| `POST events/[eventId]/sync` | Updates the existing Discord message from the database state. |
| `POST events/[eventId]/unpublish` | Deletes the Discord message and clears `messageId`. |
| `POST events/[eventId]/archive`, `delete-draft` | Archives an event / deletes a draft. |
| `POST events/[eventId]/slots`, `PATCH`/`DELETE .../slots/[slotId]`, `PATCH .../slots/reorder` | Role slot management. |
| `POST templates`, `PATCH templates/[templateId]`, `POST .../archive` | Template management. |
| `POST templates/[templateId]/slots`, `PATCH`/`DELETE .../slots/[slotId]`, `PATCH .../slots/reorder` | Template slot management (including allowed Discord roles per slot). |

Behaviors worth knowing:

- **Draft links are validated.** A draft may point at a channel and, intentionally, at an existing
  Discord message (`messageId`). `channelId` and `messageId` must be Discord snowflakes; the channel
  must belong to the server, and the message must exist in that channel and have been sent by the bot.
  The Discord REST adapter itself also refuses IDs that are not snowflakes.
- **Reorder payloads** accept at most 100 slots, without duplicate IDs or duplicate positions.
- **Errors.** Domain problems the caller can fix (`InputError`) are returned with their message.
  Prisma errors are mapped to generic answers (`P2002` -> `409`, `P2003` -> `409`, `P2025` -> `404`); anything
  else is logged on the server and answered with a generic `500`, never with database details.
- Responses that change data shown in a Discord message include `"sync": "discord_sync_pending"`: the
  database is updated, but the message is only refreshed when the event is published or synced
  (`POST .../sync`).

## Dashboard Structure

```text
app/
  api/                 # Auth.js and API routes (see above)
  guilds/              # Protected guild selection and guild-scoped module routes
  login/  profile/  settings/
  error.tsx  global-error.tsx  not-found.tsx
components/
  brand/  ui/  layout/  landing/
  dashboard/           # cards, guild panel, shared pickers (roles, channels)
config/                # navigation and site metadata
constants/             # asset paths and route constants
lib/
  auth.ts              # NextAuth options and server session helper
  discord.ts           # Discord OAuth calls and the guild/permission model
  apiGuards.ts         # requireSession, getSessionUserId
  dashboardGuilds.ts   # guild presentation helpers (server/client safe)
  env.ts               # environment checks for the login page
  server/              # server-only code
    guildAccess.ts                    # requireDashboardGuild / requireManageableDashboardGuild
    dashboardGuildResolution.ts       # verified guild list (cookie or Discord)
    dashboardGuildVerificationCookie.ts
    dashboardData.ts                  # Prisma queries and mutations
    mutationValidation.ts  apiErrors.ts  draftEventLinks.ts  publishGuards.ts
    discord*.ts  nodeWarBotServices.ts  # Discord REST helpers and bridge to the bot's services
styles/                # design tokens and shared CSS
public/assets/         # brand, characters, backgrounds, illustrations, icons
```

## Login / Preview Flow

- Authenticated users visiting `/login` are redirected to `/guilds`.
- Unauthenticated users visiting `/guilds` are redirected to `/login`.
- `/login` shows missing OAuth environment variables when OAuth is not configured.
- `/guilds?preview=1` is available for browsing the UI without Discord OAuth. It uses local UI-only
  data, is labeled as preview, and never unlocks backend actions.

## Current Limitations

- Signup Roles, Class Slots and Permissions have no dashboard-specific models; their legacy routes redirect to related areas.
- Analytics, class statistics, settings, profile and billing are placeholders until bot-backed data is connected.
- The dashboard reads and writes the existing Prisma schema directly through server-only helpers. It does not define a second schema.
- The dashboard does not manage participants, waitlists or PvE enrollments of published events; that is done in Discord with the bot.
- The user's Discord access token is stored in the session (and is therefore readable by the browser) and is not refreshed: the user signs in again when it expires. Keeping it server-side only is a pending product decision (`docs/audit/AUDIT.md`, S-6).
