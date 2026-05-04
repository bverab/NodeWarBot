# Spectre Dashboard (Foundation)

This folder contains the initial Next.js dashboard foundation for Spectre.

It is additive and does not move or modify the current bot runtime in repository root.

## Stack

- Next.js App Router
- TypeScript
- Auth.js / NextAuth (Discord provider)
- CSS-based Spectre visual system

## Install Dependencies

From repository root:

```bash
npm install --prefix apps/dashboard
```

## Required Environment Variables

Set these in `apps/dashboard/.env.local` (or in your environment):

```env
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_CLIENT_SECRET=your_discord_application_client_secret
DISCORD_BOT_TOKEN=your_discord_bot_token
NEXTAUTH_SECRET=long_random_secret
NEXTAUTH_URL=http://localhost:3000
# Optional, used only to render the empty-state invite CTA.
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_discord_application_client_id
NEXT_PUBLIC_DISCORD_BOT_INVITE_URL=https://discord.com/oauth2/authorize?...
```

Notes:
- OAuth scopes requested are `identify guilds`.
- `DISCORD_BOT_TOKEN` is required by `GET /api/guilds` to filter the OAuth guild list down to shared servers where Spectre is installed. It stays server-side and is never exposed to the browser.
- `NEXTAUTH_URL` must match the local dashboard URL.
- Discord Developer Portal must include `http://localhost:3000/api/auth/callback/discord`.
- If the dashboard runs on a different port, update both `NEXTAUTH_URL` and the Discord redirect URI to match exactly.
- Root bot variables (`TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DATABASE_URL`) stay in root `.env`. The dashboard will fall back to `TOKEN` only when `DISCORD_BOT_TOKEN` is not set in its environment.

## Run Locally

From repository root:

```bash
npm run dev --prefix apps/dashboard
```

Then open:

- `http://localhost:3000/`
- `http://localhost:3000/login`
- `http://localhost:3000/guilds`

## Current Pages

- `/` - polished Spectre landing page with current and coming-soon capability labels.
- `/login` - Discord OAuth entry page.
- `/guilds` - authenticated dashboard shell with guild cards filtered to servers where Spectre is installed.
- `/guilds?preview=1` - clearly labeled preview mode using local UI data only.
- `/guilds/[guildId]` - guild-scoped overview with honest summary placeholders.
- `/guilds/[guildId]/events`
- `/guilds/[guildId]/events/[eventId]`
- `/guilds/[guildId]/pve-events`
- `/guilds/[guildId]/schedules`
- `/guilds/[guildId]/templates`
- `/guilds/[guildId]/templates/[templateId]`
- `/guilds/[guildId]/analytics`
- `/guilds/[guildId]/event-stats`
- `/guilds/[guildId]/class-stats`
- `/guilds/[guildId]/garmoth`
- `/guilds/[guildId]/settings`
- `/profile` - authenticated Discord profile placeholder with Free plan status.
- `/settings` - authenticated global account settings placeholder.
- Legacy module routes like `/events` and `/templates` redirect to `/guilds` so bot views always require an active guild context.
- Legacy guild routes `/signup-roles`, `/class-slots`, and `/permissions` redirect to settings or class stats because those concepts are no longer primary navigation sections.

## Dashboard Structure

```text
app/
  api/                 # Auth.js and safe dashboard API routes
  guilds/              # Protected guild selection and guild-scoped module routes
  profile/             # Authenticated Discord profile placeholder
components/
  brand/               # Spectre logo and brand primitives
  ui/                  # Primitive reusable UI components
  layout/              # Dashboard shell, sidebar, topbar
  landing/             # Landing page sections and preview
  dashboard/
    cards/             # Stat and table cards
    guilds/            # Guild cards, states, preview data, and guild panel
config/
  navigation.ts        # Landing navigation config
  site.ts              # Shared product metadata
constants/
  assets.ts            # Important public asset paths
  routes.ts            # Shared app route constants
lib/
  auth.ts              # Auth.js config and server session helper
  discord.ts           # Discord OAuth API calls
  apiGuards.ts         # Server guard helpers and conservative auth stubs
  dashboardGuilds.ts   # Shared server/client-safe guild presentation helpers
  env.ts               # Dashboard environment checks
styles/
  tokens.css           # Central Spectre color and surface tokens
public/assets/
  brand/
  characters/
  backgrounds/
  illustrations/
  icons/
```

## Current API Surface

- `GET /api/guilds`
  - requires a valid NextAuth session
  - reads Discord access token from session server-side
  - fetches user guilds via Discord OAuth
  - fetches bot guilds with `DISCORD_BOT_TOKEN`
  - returns only shared guilds where the user belongs and Spectre is installed
  - includes `owner`, `permissions`, and `manageable` for future UI gating
  - returns safe guild JSON without exposing tokens

- `GET /api/guilds/[guildId]/overview`
  - validates the Discord session and shared Spectre guild access
  - returns read-only counts for active/upcoming events, participants, templates, schedules, and Garmoth profiles

- `GET /api/guilds/[guildId]/events`
  - validates guild access
  - returns read-only event list data with status, schedule metadata, signup counts, waitlist counts, and Discord publication IDs

- `GET /api/guilds/[guildId]/events/[eventId]`
  - validates guild access
  - returns read-only event detail data including role slots, participants, PvE enrollments, waitlist, fillers, and Discord message URL when present

- `PATCH /api/guilds/[guildId]/events/[eventId]`
  - validates guild access and `manageable`
  - updates safe basic fields only: `name`, `time`, `closesAt`, `expiresAt`
  - returns `discord_sync_pending` because web-to-Discord message sync is not wired yet

- `POST /api/guilds/[guildId]/events/[eventId]/close`
- `POST /api/guilds/[guildId]/events/[eventId]/reopen`
  - validate guild access and `manageable`
  - toggle the existing `Event.isClosed` field only

- `GET /api/guilds/[guildId]/templates`
- `GET /api/guilds/[guildId]/templates/[templateId]`
- `GET /api/guilds/[guildId]/schedules`
- `GET /api/guilds/[guildId]/garmoth`
  - validate guild access and return read-only module data where the Prisma schema has matching models

## Login / Preview Flow

- Authenticated users visiting `/login` are redirected to `/guilds`.
- Unauthenticated users visiting `/guilds` are redirected to `/login`.
- `/login` shows missing OAuth environment variables when Discord OAuth is not configured.
- `/guilds?preview=1` is available for browsing the UI without Discord OAuth.
- Preview mode is local UI-only data and is labeled as preview/demo in the dashboard.

## Current Limitations

- `requireGuildAdmin(sessionUserId, guildId)` is a placeholder and intentionally conservative.
- It is **not production-safe authorization** yet.
- Full guild admin validation should be added using trusted member/permission checks (likely with bot-assisted verification).
- Dashboard currently implements only basic event field updates and close/reopen signups. It does not implement PvE editor, slot editor, publish/update flows, templates CRUD, profile stats, or billing.
- Signup Roles, Class Slots, and Permissions do not have standalone dashboard-specific Prisma models yet; their legacy routes redirect to related dashboard areas.
- Dashboard reads and updates the existing Prisma schema directly through server-only helpers. It does not create a second Prisma schema.
- Guild-scoped module pages are professional placeholders until bot-backed data is connected.
- Discord message synchronization from web edits is pending because current bot publication helpers depend on Discord interaction/client context and runtime cache.
- Preview mode does not represent real Discord guild data or unlock backend actions.
