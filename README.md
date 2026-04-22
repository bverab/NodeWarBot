# NodeWarBot

Bot de Discord para gestionar eventos tipo Node War (Black Desert Online), con flujo interactivo de creación, publicación programada, inscripción por roles y herramientas de administración.

## Estado actual (resumen)

- Estable:
  - Creación y publicación de eventos (`/event create`, alias `/createwar`)
  - Eventos únicos y recurrentes (scheduler por días)
  - Inscripción por botones con waitlist y promociones
  - Edición contextual de eventos publicados (`/event edit`)
  - Integración Garmoth (`link`, `view`, `unlink`, `refresh`)
  - Render enriquecido de participantes con datos Garmoth (cuando existen)
  - Edición de recurrencias desde `/event edit` (agregar/editar/eliminar días en alcance serie)
  - Publicación forzada administrativa con `/event publish`
- Persistencia:
  - SQLite + Prisma como única fuente de verdad
  - JSON solo para importación legacy y export/backup manual

## Instalación

```bash
git clone <tu-repo>
cd NodeWarBot
npm install
```

## Variables de entorno

Crea `.env` en la raíz (puedes copiar desde `.env.example`):

```env
TOKEN=tu_token_discord
CLIENT_ID=tu_client_id
GUILD_ID=123456789012345678,987654321098765432
DATABASE_URL="file:../data/nodewarbot.db"
```

Notas:

- `GUILD_ID` acepta uno o varios IDs separados por coma.
- `DATABASE_URL` apunta al archivo SQLite (ruta relativa a `prisma/schema.prisma`).

## Persistencia (Prisma + SQLite)

- Schema: `prisma/schema.prisma`
- Migraciones SQL: `prisma/migrations/`
- Capa DB: `src/db/`

### Flujo recomendado de setup

1. Generar cliente Prisma:

```bash
npm run db:generate
```

2. Aplicar migraciones:

```bash
npm run db:migrate:deploy
```

Si en tu entorno falla `prisma migrate deploy` por un error de schema engine, aplica SQL explícito:

```bash
npx prisma db execute --file prisma/migrations/20260421160000_init_sqlite_persistence/migration.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations/20260421205000_hardening_constraints/migration.sql --schema prisma/schema.prisma
```

Si la DB ya existía y fue creada por `db execute`, marca baseline para que `migrate deploy` funcione:

```bash
npx prisma migrate resolve --applied 20260421160000_init_sqlite_persistence
npx prisma migrate resolve --applied 20260421205000_hardening_constraints
```

## Migración legacy JSON -> SQLite

Script de importación:

```bash
npm run db:import-json
```

Este script:

- crea backup timestamped en `data/backups/<timestamp>/`
- importa `data/wars.json` y `data/garmoth-links.json` a SQLite
- no habilita fallback ni mirror JSON en runtime

## Export/backup manual SQLite -> JSON

Para respaldo manual fuera del flujo normal:

```bash
npm run db:export-json
```

Salida:

- `data/exports/<timestamp>/wars.json`
- `data/exports/<timestamp>/garmoth-links.json`

## Estructura resumida

- `src/commands/`: slash commands
- `src/handlers/`: handlers de interacciones, botones y modales
- `src/services/`: servicios de dominio
- `src/db/`: cliente Prisma, repositorios y bootstrap de persistencia
- `src/utils/`: builders, formatters, resolvers y helpers
- `prisma/`: schema y migraciones SQL
- `data/`: SQLite (`nodewarbot.db`), JSON legacy, backups y exports manuales

## Comandos npm relevantes

- `npm start`
- `npm run register`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:migrate:deploy`
- `npm run db:import-json`
- `npm run db:export-json`
- `npm test`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:watch`
- `npm run test:coverage`

## Flujos administrativos nuevos

### Edición de horario en series recurrentes

Desde `/event edit`:

1. Abrir evento.
2. `Editar horario`.
3. Elegir alcance `Toda la serie`.
4. Usar el gestor de recurrencia para:
   - ver días/horarios actuales,
   - agregar día,
   - editar día seleccionado,
   - eliminar día seleccionado (sin vaciar la serie).

Para alcance `Solo ocurrencia` y eventos no recurrentes, se mantiene el flujo modal anterior.

### Publicación forzada

Nuevo subcomando:

```bash
/event publish [id] [alcance]
```

- `id` opcional (si no se envía, intenta usar evento activo en el canal).
- `alcance` opcional: `single` (default) o `series`.
- Comportamiento:
  - si la ocurrencia no tiene mensaje: publica uno nuevo,
  - si ya tiene mensaje: lo actualiza.
- Solo administradores (mismo criterio de permisos del editor/admin actual).

## Notas de hardening

- SQLite es la única persistencia activa durante operación normal.
- No hay dual write SQLite->JSON.
- No hay fallback automático desde JSON al iniciar.
- `server-class-emojis.json` sigue como configuración JSON de solo lectura (no persistencia de dominio).

## Testing

La suite está separada por propósito:

- `tests/unit`: lógica pura (sin DB).
- `tests/integration`: repositorios/Prisma/flujo de persistencia real.
- `tests/smoke`: chequeos mínimos de arranque de persistencia.

### Ejecutar tests

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:coverage
```

### DB de test

- Los tests usan una SQLite separada: `data/test/nodewarbot.test.db`.
- `DATABASE_URL` de tests se configura en `tests/setup/env.js`.
- Antes de la suite de integración se aplican las migraciones SQL del proyecto directamente sobre la DB de test.
- Cada test de integración limpia estado (eventos, perfiles Garmoth y guilds).

### Reglas de la suite

- No se usa la DB real de runtime.
- No se usa JSON legacy en runtime de tests salvo en pruebas específicas de import/export.
- Tests deterministas, sin dependencia de servicios externos.

### Patrones para agregar nuevos tests

1. Si es lógica pura, agrégalo en `tests/unit`.
2. Si valida persistencia/reglas de datos, agrégalo en `tests/integration` con `setupIntegrationSuite()`.
3. Usa factories en `tests/factories` para evitar duplicación de payloads.
4. En integration, valida estado final en DB y errores esperados de constraints, no solo “happy path”.

## Post-Edicion y Recurrencia (Actualizacion)

### Decision explicita post-edicion (activar o no)

En `/event edit`, despues de guardar cambios en un evento que quede no activo (cerrado, sin mensaje publicado o expirado), el bot muestra una decision explicita:

- `Guardar cambios y activar`
- `Guardar cambios sin activar`

Semantica:

- `Guardar cambios y activar` intenta publicar/actualizar y deja el evento en estado activo/publicable.
- Si hay `messageId` stale o el mensaje no existe, crea una nueva publicacion.
- `Guardar cambios sin activar` persiste cambios y no publica automaticamente.
- Para activar luego, se puede usar `/event publish`.

### Recurrencia semanal validada operativamente

La recurrencia semanal se valida con tests de integracion de scheduler:

- publica en el slot semanal esperado,
- permite cierre/expiracion de la ocurrencia,
- vuelve a publicar la semana siguiente,
- mantiene la serie recurrente utilizable (`schedule.enabled` sigue activo en recurrentes).

### Tests nuevos relevantes

- `tests/integration/eventEditActivation.integration.test.js`
- `tests/integration/schedulerRecurrence.integration.test.js`

## Actualizacion UX: recurrencia y publicacion

- En gestor de recurrencia, `Agregar dia` ahora acepta multiples dias con una sola hora.
- Formato recomendado:
  - Hora: `HH:mm`
  - Dias: `0;2;4` donde `0=Domingo ... 6=Sabado`.
- Se permiten espacios opcionales y se deduplican dias repetidos.
- El sistema reporta que dias se agregaron, cuales ya existian y cuales fueron invalidos.
- `Agregar dia(s)` solo agrega nuevos dias y no reemplaza la serie existente.
- `Editar dia` modifica solo la ocurrencia seleccionada.

Semantica de edicion/publicacion:

- El panel principal de `/event edit` ya no tiene accion ambigua de `Publicar/actualizar` en un clic sin contexto.
- Publicar/activar queda separado en:
  - flujo post-edicion (`Guardar cambios y activar` / `Guardar cambios sin activar`),
  - comando `/event publish`.
- El panel principal incluye cierre explicito del proceso:
  - `Guardar sin publicar`
  - `Guardar y publicar`

Semantica de cierre:

- Cerrar un evento bloquea nuevas inscripciones, pero conserva participantes/slots/waitlist del estado final.
- Reactivar/republicar una ocurrencia no limpia roster automaticamente.
- El cleanup destructivo de roster no forma parte del cierre normal.

## Reordenar roles en /event edit

Dentro de `Editar roles`, ahora puedes cambiar el orden de slots sin borrar ni recrear roles:

- Selecciona un rol.
- Usa `Subir` / `Bajar` para ajustar posicion.

Comportamiento:

- Se mueve el rol completo (incluyendo sus usuarios/permisos/icono), sin reasignar usuarios a otros roles.
- El orden queda persistido en SQLite y el render respeta ese orden.
- Si el evento esta publicado, el mensaje se refresca automaticamente.
