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
NEXTAUTH_SECRET=long_random_secret
NEXTAUTH_URL=http://localhost:3000
```

Notes:
- OAuth scopes requested are `identify guilds`.
- `NEXTAUTH_URL` must match the local dashboard URL.
- Discord Developer Portal must include `http://localhost:3000/api/auth/callback/discord`.
- If the dashboard runs on a different port, update both `NEXTAUTH_URL` and the Discord redirect URI to match exactly.
- Root bot variables (`TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DATABASE_URL`) stay in root `.env`.

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
- `/guilds` - authenticated dashboard shell with guild cards from Discord OAuth.
- `/guilds?preview=1` - clearly labeled preview mode using local UI data only.

## Dashboard Structure

```text
app/
  api/                 # Auth.js and safe dashboard API routes
  guilds/              # Protected guild dashboard page
components/
  brand/               # Spectre logo and brand primitives
  ui/                  # Primitive reusable UI components
  layout/              # Dashboard shell, sidebar, topbar
  landing/             # Landing page sections and preview
  dashboard/           # Guild cards, states, tables, stat cards
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
  - returns safe guild JSON without exposing tokens

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
- Dashboard currently does not implement event editing, PvE editor, publish/update flows, templates UI, or billing.
- Dashboard currently does not run Prisma directly and does not create a second Prisma schema.
- Garmoth and premium dashboard features are copy-only placeholders marked as coming soon.
- Preview mode does not represent real Discord guild data or unlock backend actions.
