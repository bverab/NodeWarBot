# NodeWarBot

NodeWarBot is a Discord bot focused on organizing **Black Desert Online** group activities.
It was originally built for Node War / Siege coordination and now also supports PvE slot-based planning.
Status: MVP stable – actively evolving

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
- post-edit publish/update flows,
- an optional web dashboard (`apps/dashboard`) that reads and edits the same database.

## Main Features

- **War/Siege event creation** with role slots (up to 20 per event), role icons, waitlist, and role restrictions.
- **PvE event creation** with multiple time slots and per-slot capacity.
- **Recurring events** (single occurrence or recurring series).
- **Event templates** for War/Siege.
- **Interactive signup flows** using Discord components.
- **Event edit panel** under `/event edit` (administrators only).
- **Manual/forced publication flows** (`/event publish` + post-edit activation).
- **SQLite persistence with Prisma** as primary storage, in WAL mode so the bot and the dashboard can share it.
- **Web dashboard** (Next.js) for managing events and templates, see [`apps/dashboard/README.md`](apps/dashboard/README.md).
- **Vitest test suite** (unit + integration + smoke), ESLint and CI.

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
  Opens event selector + interactive admin panel (administrators only).
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
  Link and sync Garmoth profile metadata. `link` and `refresh` have a per-user cooldown of 60 seconds.
- `/fakeuser add|remove`  
  Test helper for fake participants/waitlist behavior. **Administrators only** (registered with the
  Administrator default permission and checked again at runtime).
- `/ping`  
  Basic bot latency check.

### Legacy aliases

- `/createwar` – alias of `/event create` for War events.
- `/editrole ...` – edits the roles of the event you are creating, without using the modal.

> **Command definitions change between versions.** After updating, run `pnpm register` again
> (see [Deployment & Updates](#deployment--updates)). In particular, `/fakeuser` becoming
> admin-only and the 1-999 slot limit of `/editrole slots` only reach Discord after re-registering.

## Guided Installation

## 1) Prerequisites

- Node.js **20, 22 or 24+** (`engines` in `package.json`, the range Vitest 4 supports; `.nvmrc` pins 24)
- [pnpm](https://pnpm.io/installation) **12+** (the exact version is pinned in `package.json` → `packageManager`)
- A Discord application + bot token
- Bot invited to your test guild with slash command scope

> This project uses **pnpm, not npm**. Do not run `npm install`: it ignores
> `pnpm-lock.yaml` and the supply-chain policy described in
> [Package Manager & Supply-Chain Policy](#package-manager--supply-chain-policy).

## 2) Clone the repository

```bash
git clone https://github.com/bverab/NodeWarBot.git
cd NodeWarBot
```

## 3) Install dependencies

```bash
pnpm install
```

This installs the bot and the dashboard (`apps/dashboard`) in one step, since the
repository is a pnpm workspace with a single `pnpm-lock.yaml`. In CI and on servers use
`pnpm install --frozen-lockfile`, which fails instead of modifying the lockfile.

## 4) Configure environment

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

```env
TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
GUILD_ID=123456789012345678,987654321098765432
DATABASE_URL="file:../data/nodewarbot.db"
# Optional: folder for backups, JSON exports and legacy JSON files (default: ./data)
NODEWARBOT_DATA_DIR=
```

`GUILD_ID` supports comma-separated values for multi-guild command registration.
The dashboard has its own example file: [`apps/dashboard/.env.example`](apps/dashboard/.env.example).

## 5) Generate Prisma client

```bash
pnpm db:generate
```

Dependency install scripts are disabled, so Prisma does not generate its client
during `pnpm install`. Run this step after every fresh install.

## 6) Apply migrations / DB setup

```bash
pnpm db:migrate:deploy
```

For local iterative schema work:

```bash
pnpm db:migrate
```

## 7) Register slash commands

```bash
pnpm register
```

## 8) Run the bot

```bash
pnpm start
```

The bot stops cleanly on `SIGINT`/`SIGTERM`: it stops the scheduler, waits for the tick in progress,
closes the Discord client and then the database.

## 9) Run tests

```bash
pnpm test
```

or by suite:

```bash
pnpm test:unit
pnpm test:integration
```

## 10) Run the dashboard (optional)

```bash
pnpm dashboard:dev
```

See [`apps/dashboard/README.md`](apps/dashboard/README.md) for its environment variables.

## Deployment & Updates

Steps for a first deployment and for every update, in this order:

```bash
git pull
pnpm install --frozen-lockfile   # exact versions from pnpm-lock.yaml
pnpm db:generate                 # install scripts are disabled: generate the Prisma client explicitly
pnpm db:migrate:deploy           # apply pending migrations (take a backup first, see below)
pnpm register                    # needed when command definitions changed (see the release notes / diff)
pnpm start                       # restart the bot process
```

Notes:

- **`pnpm register` replaces the full command list of each guild in `GUILD_ID`.** It aborts before
  calling Discord if any command file fails to load (so a broken file can never delete a command from
  your servers), and exits with a non-zero code if any guild fails. It does not need to run on every
  deploy, only when something under `src/commands` changed its definition.
- Restart the bot after changing the Prisma schema. The bot logs the resolved SQLite path at startup.
- To deploy the dashboard too: `pnpm dashboard:build` and then `pnpm --filter @spectre/dashboard start`.
  Both processes use the same SQLite file (WAL mode); set the same `DATABASE_URL` for both.
- Run the tests (`pnpm check` runs lint + typecheck + tests) before deploying changes.

### Backups

```bash
pnpm db:backup                    # copy to <data dir>/backups/nodewarbot-YYYYMMDD-HHmmss.db
pnpm db:backup --keep=30          # keep the 30 newest copies (default: 14)
pnpm db:backup --dir=/mnt/backups # write somewhere else
```

The copy is made with SQLite's `VACUUM INTO`, which is consistent while the bot and the dashboard
are running (do not copy the `.db` file by hand: in WAL mode part of the data lives in the
`-wal` file). Only files named `nodewarbot-YYYYMMDD-HHmmss.db` are pruned. Schedule it
(cron, Windows Task Scheduler, a systemd timer...) to run at least daily.

To restore: stop the bot and the dashboard, delete `nodewarbot.db`, `nodewarbot.db-wal` and
`nodewarbot.db-shm`, copy the chosen backup to the path of `DATABASE_URL` as `nodewarbot.db`, and start again.

## Package Manager & Supply-Chain Policy

The project moved from npm to **pnpm** after the npm registry supply-chain attacks,
where hijacked maintainer accounts published malicious versions of popular packages
that ran code on install. pnpm still downloads packages from the npm registry, so the
protection comes from the policy in `pnpm-workspace.yaml`:

| Setting | Effect |
| --- | --- |
| `minimumReleaseAge: 10080` | Only versions published at least **7 days** ago can be installed, which leaves time for a malicious release to be detected and pulled. |
| `trustPolicy: no-downgrade` | Installation fails if a version has weaker trust evidence (e.g. lost provenance) than earlier releases of the same package, a common sign of a hijacked publish. |
| `trustPolicyIgnoreAfter: 525600` | Skips that check for versions published more than a year ago. |
| `allowBuilds` | Dependency install scripts (`preinstall`/`postinstall`) are denied. A new dependency with an install script makes `pnpm install` fail until it is reviewed. |
| `permissions` | Agent skills bundled inside dependencies are not installed. |
| `savePrefix: ''` | `pnpm add` saves exact versions. |

pnpm only reads auth and registry settings from `.npmrc`, so these settings must stay
in `pnpm-workspace.yaml`.

Day-to-day commands:

```bash
pnpm add <package>          # add a dependency to the bot
pnpm add -D <package>       # add a dev dependency
pnpm --filter @spectre/dashboard add <package>   # add a dashboard dependency
pnpm approve-builds         # review a dependency that wants to run install scripts
pnpm audit                  # check installed packages for known vulnerabilities
```

Always commit `pnpm-lock.yaml` together with the `package.json` change that produced it.
The GitHub Actions workflow pins its actions by commit SHA for the same reason.

## Environment Variables

The complete, commented list lives in [`.env.example`](.env.example) (bot) and
[`apps/dashboard/.env.example`](apps/dashboard/.env.example) (dashboard).

Bot (`.env` in the project root):

- `TOKEN`  
  Discord bot token. Required to run the bot and to register commands.
- `CLIENT_ID`  
  Discord application ID used for command registration.
- `GUILD_ID`  
  Target guild ID(s), comma-separated. Used by `pnpm register`.
- `DATABASE_URL`  
  Prisma datasource URL for SQLite. Required, and shared with the dashboard.
- `NODEWARBOT_DATA_DIR` (optional)  
  Base folder for backups (`pnpm db:backup`), JSON import/export and the legacy JSON files.
  Defaults to `./data`.

## Database / Persistence

NodeWarBot uses **SQLite + Prisma** as the primary persistence layer.

- Prisma schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/*`
- Runtime initialization: `src/db/init.js` (enables WAL mode)

Key DB scripts:

- `pnpm db:generate` -> generate Prisma client
- `pnpm db:migrate` -> dev migration workflow
- `pnpm db:migrate:deploy` -> apply existing migrations
- `pnpm db:backup` -> consistent copy of the database with retention (see [Backups](#backups))
- `pnpm db:import-json` -> migrate legacy JSON into SQLite. It refuses to run if the JSON files are missing or
  invalid, and if the database already has events unless you pass `--force`; before importing it
  backs up the JSON files and the database.
- `pnpm db:export-json` -> export SQLite state to legacy JSON format (events and Garmoth profiles; PvE slots
  and templates are not exported)

SQLite is treated as the source of truth in current architecture.

When the Prisma schema changes, run `pnpm db:generate` and restart the bot
process. The bot logs the resolved SQLite path on startup so the dashboard and
bot can be verified against the same database file. For the default
`DATABASE_URL="file:../data/nodewarbot.db"`, Prisma resolves the path relative
to `prisma/schema.prisma`.

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

`/event edit` for PvE uses a dedicated panel with:
- slot/capacity management,
- restricted access user management (allowed/prioritized users),
- participant + filler operations (add/remove/move/promote),
- publish/update via "Guardar y publicar",
- close/reactivate signups from the same panel.

Render goals:
- familiar visual language with War/Siege,
- horizontal slot grid,
- compact filler visibility.

## Testing, Linting and CI

Testing is powered by **Vitest**.

- Unit tests: `tests/unit`
- Integration tests: `tests/integration` (they use their own SQLite file under `data/test`)
- Smoke checks: `tests/smoke`

Commands:

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:coverage      # coverage over src/** and apps/dashboard/lib/**, including files no test loads
pnpm lint               # ESLint (bot + dashboard)
pnpm typecheck          # tsc --noEmit for the dashboard
pnpm check              # lint + typecheck + test
```

ESLint rules start as **warnings**: `pnpm lint` reports problems without failing, and the rules are
meant to be tightened gradually. The workflow in `.github/workflows/ci.yml` runs install
(`--frozen-lockfile`), `db:generate`, lint, typecheck, tests and the dashboard build on every push and
pull request; it needs no secrets.

## Project Structure

```text
src/
  index.js              # Bot entrypoint (client, interaction routing, scheduler, shutdown)
  register-commands.js  # `pnpm register`: registers slash commands per guild
  commands/             # Slash commands (event/ holds the /event subcommands)
  handlers/             # Command, button, modal and component handlers
    interaction/        #   admin panel and draft role-panel actions
    modal/              #   modal submit flows (schedule, admin panel)
  services/             # Domain logic (events, scheduler, PvE, templates, publication, lifecycle...)
  db/                   # Prisma client, repositories, init, JSON import/export
  utils/                # Message builders, formatters, validation and limit helpers
  constants/            # Event types and Discord-driven limits

apps/
  dashboard/            # Next.js dashboard (own README, own .env.example)

prisma/
  schema.prisma
  migrations/

scripts/
  backup-db.js              # pnpm db:backup
  migrate-json-to-sqlite.js # pnpm db:import-json
  export-sqlite-to-json.js  # pnpm db:export-json

tests/
  unit/  integration/  smoke/
  helpers/  factories/  setup/  support/   # shared test infrastructure

docs/audit/             # Code audit and the action plan that was applied
.github/workflows/      # CI
data/                   # Runtime data: SQLite file, backups, exports (ignored by git)
```

## Current Status / Limitations

- Production-oriented event flows are implemented for War/Siege and PvE.
- `10v10` remains a placeholder.
- PvE templates are not fully enabled as first-class template type yet.
- Some legacy command surfaces still coexist with newer `/event` flows.
- `/event schedule view` is visible to every member of the channel; `/event create` is not restricted to
  administrators. Both are product decisions listed in `docs/audit/AUDIT.md`.

## Contributing

Contributions are welcome.

Recommended workflow:

1. Create a feature branch.
2. Keep changes focused and test-backed.
3. Run `pnpm check` (lint + typecheck + tests).
4. Open a PR with a clear summary, risks, and validation notes.
