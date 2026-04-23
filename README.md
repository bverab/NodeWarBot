# NodeWarBot

NodeWarBot is a Discord bot focused on organizing **Black Desert Online** group activities.
It was originally built for Node War / Siege coordination and now also supports PvE slot-based planning.

The project emphasizes practical event operations in Discord:
- create and publish events quickly,
- manage signups and constraints,
- run recurring schedules,
- edit live events safely,
- keep persistence robust with SQLite + Prisma.

## Project Overview

NodeWarBot helps guilds and friend groups coordinate BDO events directly in Discord with interactive embeds and buttons.
It supports:
- war-style role-slot signups (War/Siege),
- PvE time-slot signups with fillers and restricted mode,
- recurring event series,
- reusable templates for faster setup,
- post-edit publish/update flows.

## Main Features

- **War/Siege event creation** with role slots, role icons, waitlist, and role restrictions.
- **PvE event creation** with multiple time slots and per-slot capacity.
- **Recurring events** (single occurrence or recurring series).
- **Event templates** for War/Siege.
- **Interactive signup flows** using Discord components.
- **Event edit panel** under `/event edit`.
- **Manual/forced publication flows** (`/event publish` + post-edit activation).
- **SQLite persistence with Prisma** as primary storage.
- **Vitest test suite** (unit + integration + smoke).

## Supported Event Types

- **War**: role-based signup model for Node War coordination.
- **Siege**: same role-based model with Siege labeling.
- **PvE**: time-slot model with:
  - normal enrollments by slot,
  - fillers by slot,
  - optional restricted access by selected users.

> `10v10` is present as a placeholder type but is not implemented yet.

## Commands

### Core Event Command

- `/event create`  
  Starts event creation (`war`, `siege`, `pve`) and optional template usage.
- `/event edit`  
  Opens event selector + interactive admin panel.
- `/event publish`  
  Forces publish/update for one occurrence or an entire series.

### Schedule Management

- `/event schedule view`  
  Lists active schedules in the channel.
- `/event schedule cancel`  
  Cancels one scheduled event by ID.

### Templates (War/Siege)

- `/event template create`
- `/event template update`
- `/event template list`
- `/event template archive`
- `/event template restore`

### Admin Utilities

- `/eventadmin ...`  
  Additional admin operations on published events (members, lock/unlock, role maintenance, recap settings).

### Profile / Utilities

- `/garmoth link|view|refresh|unlink`  
  Link and sync Garmoth profile metadata.
- `/fakeuser add|remove`  
  Test helper for fake participants/waitlist behavior.
- `/ping`  
  Basic bot latency check.

## Guided Installation

## 1) Prerequisites

- Node.js **18+** (Discord.js v14 requirement)
- npm
- A Discord application + bot token
- Bot invited to your test guild with slash command scope

## 2) Clone the repository

```bash
git clone <your-repo-url>
cd NodeWarBot
```

## 3) Install dependencies

```bash
npm install
```

## 4) Configure environment

Create `.env` in project root:

```env
TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
GUILD_ID=123456789012345678
DATABASE_URL="file:../data/nodewarbot.db"
NODEWARBOT_DATA_DIR=./data
```

`GUILD_ID` supports comma-separated values for multi-guild command registration.

## 5) Generate Prisma client

```bash
npm run db:generate
```

## 6) Apply migrations / DB setup

```bash
npm run db:migrate:deploy
```

For local iterative schema work:

```bash
npm run db:migrate
```

## 7) Register slash commands

```bash
npm run register
```

## 8) Run the bot

```bash
npm start
```

## 9) Run tests

```bash
npm test
```

or by suite:

```bash
npm run test:unit
npm run test:integration
```

## Environment Variables

- `TOKEN`  
  Discord bot token.
- `CLIENT_ID`  
  Discord application ID used for command registration.
- `GUILD_ID`  
  Target guild ID(s), comma-separated.
- `DATABASE_URL`  
  Prisma datasource URL for SQLite.
- `NODEWARBOT_DATA_DIR` (optional but recommended)  
  Base folder for legacy JSON import/export and backup tooling.

## Database / Persistence

NodeWarBot uses **SQLite + Prisma** as the primary persistence layer.

- Prisma schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/*`
- Runtime initialization: `src/db/init.js`

Key npm DB scripts:

- `npm run db:generate` -> generate Prisma client
- `npm run db:migrate` -> dev migration workflow
- `npm run db:migrate:deploy` -> apply existing migrations
- `npm run db:import-json` -> migrate legacy JSON into SQLite
- `npm run db:export-json` -> export SQLite state to legacy JSON format

SQLite is treated as the source of truth in current architecture.

## Templates

Templates are available for War/Siege and are intended to accelerate recurring setup.

They store reusable configuration such as:
- event metadata defaults,
- role slots,
- role permissions,
- notify targets.

Use `/event template ...` to create, update, archive, and restore templates.

## Recurring Events

Recurring support includes:
- per-day occurrences under a series (`groupId`),
- schedule mode (`once` or recurring),
- series-level edits for selected operations,
- scheduler-driven publish lifecycle.

PvE slots are cloned per occurrence (no shared runtime signup state across days).

## PvE Events

Current PvE model is slot-oriented:

- multiple time slots per event,
- per-slot capacity,
- normal enrollments and fillers per slot,
- restricted mode by selected users (`OPEN` / `RESTRICTED`),
- multiple slots per user are supported as long as no duplicate within the same slot.

Render goals:
- familiar visual language with War/Siege,
- horizontal slot grid,
- compact filler visibility.

## Testing

Testing is powered by **Vitest**.

- Unit tests: `tests/unit`
- Integration tests: `tests/integration`
- Smoke checks: `tests/smoke`

Commands:

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:coverage
```

## Project Structure

```text
src/
  commands/        # Slash commands
  handlers/        # Interaction, button, modal handlers
  services/        # Domain logic (event, scheduler, pve, templates, etc.)
  db/              # Prisma client + repositories + init
  utils/           # Builders, formatters, helpers

prisma/
  schema.prisma
  migrations/

tests/
  unit/
  integration/
  smoke/

scripts/
  migrate-json-to-sqlite.js
  export-sqlite-to-json.js
```

## Current Status / Limitations

- Production-oriented event flows are implemented for War/Siege and PvE.
- `10v10` remains a placeholder.
- PvE templates are not fully enabled as first-class template type yet.
- Some legacy command surfaces still coexist with newer `/event` flows.

## Contributing

Contributions are welcome.

Recommended workflow:

1. Create a feature branch.
2. Keep changes focused and test-backed.
3. Run `npm run test:unit` and `npm run test:integration`.
4. Open a PR with a clear summary, risks, and validation notes.
