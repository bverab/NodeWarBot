# NodeWarBot Dashboard (Foundation)

This folder contains the initial Next.js dashboard foundation for NodeWarBot.

It is additive and does not move or modify the current bot runtime in repository root.

## Stack

- Next.js App Router
- TypeScript
- Auth.js / NextAuth (Discord provider)

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
NEXTAUTH_URL=http://localhost:3001
```

Notes:
- OAuth scopes requested are `identify guilds`.
- `NEXTAUTH_URL` must match the local dashboard URL.
- Root bot variables (`TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DATABASE_URL`) stay in root `.env`.

## Run Locally

From repository root:

```bash
npm run dev --prefix apps/dashboard
```

Then open:

- `http://localhost:3001/`
- `http://localhost:3001/login`
- `http://localhost:3001/guilds`

## Current API Surface

- `GET /api/guilds`
  - requires a valid NextAuth session
  - reads Discord access token from session server-side
  - fetches user guilds via Discord OAuth
  - returns safe guild JSON without exposing tokens

## Current Limitations

- `requireGuildAdmin(sessionUserId, guildId)` is a placeholder and intentionally conservative.
- It is **not production-safe authorization** yet.
- Full guild admin validation should be added using trusted member/permission checks (likely with bot-assisted verification).
- Dashboard currently does not implement event editing, PvE editor, publish/update flows, templates UI, or billing.
- Dashboard currently does not run Prisma directly and does not create a second Prisma schema.
