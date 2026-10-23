# Plan de acción — correcciones de la auditoría

Complemento de [`AUDIT.md`](AUDIT.md). Cada ítem cita los IDs de hallazgo que resuelve.

## 1. Principios

1. **No romper nada.** Solo se corrige comportamiento que es claramente un defecto. Todo lo que
   cambia reglas del producto queda en `AUDIT.md` §5 para que lo decida el dueño del repo.
2. **Test primero.** Cada corrección empieza con un test de regresión que falla con el código actual
   (se ejecuta y se ve fallar), luego el cambio mínimo, luego el test pasa.
3. **Suite completa después de cada ítem.** `pnpm test` sin regresiones. Si se tocó el dashboard:
   `tsc --noEmit` y `next build`.
4. **Un commit por ítem** (`fix(<área>): <qué> [IDs]`), para poder revertir cualquier cambio de forma
   aislada con `git revert`.
5. **Propiedad de archivos estricta.** Cada agente solo edita los archivos de su área (tabla §3). Si
   un ítem exige tocar otro archivo, se salta y se reporta.
6. **Si un hallazgo no se reproduce, no se cambia nada**: se reporta como descartado.
7. **Sin dependencias nuevas** salvo en la fase 5 (tooling), y siempre con la política de
   `pnpm-workspace.yaml` (7 días de antigüedad mínima, scripts de instalación denegados).

## 2. Protocolo por ítem

```
1. Leer el código y confirmar el hallazgo (si no se confirma → "descartado", siguiente ítem).
2. Escribir el test de regresión y ejecutarlo: debe FALLAR por la razón esperada.
3. Implementar el cambio mínimo, en el estilo del código vecino.
4. Ejecutar el test nuevo (pasa) y luego la suite completa (sin regresiones).
5. Dashboard tocado → pnpm --filter @spectre/dashboard exec tsc --noEmit -p .  y  next build.
6. Commit atómico con los IDs.
7. Anotar en el reporte: ID, archivos, test, comandos ejecutados y resultado.
```

Línea base contra la que se compara: 139/141 tests (2 fallos conocidos de D-1, que deben pasar tras
el ítem 1.1), cobertura 49 % sentencias, build OK.

## 3. Organización: fases, agentes y propiedad de archivos

Cada agente de implementación trabaja en **su propio git worktree** (base de datos de test propia,
sin interferencias). El orquestador integra las ramas, corre la verificación completa y hace los
merges.

| Fase | Agente | Modelo | Corre en paralelo con | Archivos que puede editar |
|------|--------|--------|-----------------------|---------------------------|
| 1 | `bot-core` | Opus | 2, 3 | `src/utils/warState.js`, `src/utils/eventLifecycleTimes.js`, `src/db/**`, `src/services/**` (excepto `garmothProfileService.js`), `src/commands/event/eventAdmin.js`, `src/index.js`, `scripts/**`, `tests/helpers/**`, `tests/factories/**`, tests nuevos o existentes de esas áreas |
| 2 | `bot-interaction` | Sonnet | 1, 3 | `src/handlers/**`, `src/commands/**` (excepto `event/eventAdmin.js`), `src/utils/**` (excepto `warState.js` y `eventLifecycleTimes.js`), `src/services/garmothProfileService.js`, `src/register-commands.js`, `src/constants/**`, tests **nuevos** (no edita `tests/helpers` ni `tests/factories`) |
| 3 | `dashboard` | Sonnet | 1, 2 | `apps/dashboard/**`, `tests/**/dashboard*.ts` |
| I | orquestador | — | — | Integración 1+2+3, verificación completa |
| 4 | `bot-core` (continúa) | Opus | 5 | `src/db/**`, `src/services/**`, `src/handlers/**`, `src/commands/**`, `prisma/**`, tests |
| 5 | `bot-interaction` (continúa) | Sonnet | 4 | `package.json`, `pnpm-lock.yaml`, `apps/dashboard/package.json`, `vitest.config.js`, `eslint.config.*`, `.github/**`, `.gitignore`, `.env.example`, `.nvmrc`, `.editorconfig`, `README.md`, `apps/dashboard/README.md`, `scripts/backup-db.js`, código muerto listado en 5.x |
| II | orquestador | — | — | Integración 4+5, verificación completa |
| 6 | `reviewer` (revisor del plan, continúa) | Opus | — | Solo lectura: revisión del diff completo |

Total de agentes: 6 auditores + revisor + 3 implementadores = **10**.

## 4. Fases e ítems

### Fase 1 — Integridad de datos del bot (`bot-core`)

**1.1 · `normalizeWar` idempotente con prioridad de campos canónicos** · D-1, H-1, D-5, bug `publishAt`
- Cambio (`src/utils/warState.js`):
  - `createdAt = war.createdAt` si es finito, si no `war.publishAt`, si no `deriveCreatedAt`.
    Igual `expiresAt` (canónico, luego `eventEndAt`) y `closesAt` (canónico, luego `signupCloseAt`).
    Los alias quedan solo como **entrada de respaldo** para JSON antiguo.
  - `scheduledPublishAt` solo desde `war.scheduledPublishAt` (nunca desde `publishAt`).
  - No emitir `publishAt`/`signupCloseAt`/`eventEndAt` en el objeto normalizado, **previa verificación
    con Grep en `src/`, `apps/`, `scripts/` y `tests/`** de que nadie los lee de un evento (los objetos
    `lifecycle` sí los usan y no se tocan). Si algo los lee, se mantienen pero con el valor canónico.
  - `dayOfWeek`: `null`/`undefined`/no entero → `null`; entero 0–6 → número.
- Tests:
  - Unit: `normalizeWar(normalizeWar(x))` igual a `normalizeWar(x)` para una tabla de entradas (con y
    sin alias, con `scheduledPublishAt ≠ createdAt`, con `dayOfWeek: null`).
  - Unit: `applyLifecycleToWar({...normalizeWar(x)}, lc)` y luego `normalizeWar` conserva las horas de `lc`.
  - Integración: `createWar` de un borrador programado → `prisma.event.findUnique` conserva
    `scheduledPublishAt`; igual tras `updateWar(loadWars()[0])` y tras `loadWarsFresh()`.
  - Integración (`schedulerRecurrence`): tras republicar la semana 2, `expiresAt > nextWeekSlot`, y un
    tick 2 minutos después no cierra ni expira el evento.
- Aceptación: pasan los 2 tests hoy rotos y los nuevos.
- Riesgo: bajo. Es el origen de varios hallazgos; se hace primero.

**1.2 · Eliminar el reemplazo total de la base en producción** · D-2, C-1, S-1
- Cambio:
  - Nuevo `deleteWarById(id)` en el repositorio (dentro de `withEventLock`, borra la fila con cascada
    y la quita de la caché), expuesto por `warService`.
  - `handleScheduleCancel` (`src/commands/event/eventAdmin.js`): exige `isAdminExecutor` (igual que
    `edit`/`publish`/`template`) y usa `deleteWarById`. `handleScheduleView` también exige admin.
    **Se mantiene la semántica actual** (cancelar = borrar ese evento).
  - `removeSeriesDay`: `deleteWarById(target.id)`.
  - `editSeriesDay` con cambio de id: reemplazar solo ese evento — borrar el viejo y crear el nuevo
    **en una sola transacción y en ese orden** (`Event.messageId` es `@unique` y la copia conserva el
    `messageId`), luego copiar los slots PvE como hoy. Mismo comportamiento por evento, sin tocar el
    resto de la base.
  - `saveWars` deja de usarse en producción; se documenta como utilidad de test/importación.
- Tests (integración): con dos eventos PvE con inscripciones y un evento insertado directo con
  Prisma (fuera de la caché): cancelar un tercer evento, quitar un día de una serie y mover un día
  dejan intactos `eventEnrollment.count()`, `eventOption.count()` y el evento externo. Unit: un no
  admin recibe rechazo en `schedule cancel` y no se borra nada.
- Riesgo: medio (flujos de series). Cubierto por los tests de series existentes.

**1.3 · Renderizar el evento recibido al editar el mensaje** · D-6
- Cambio: en `discordEventSyncService.updateEventDiscordMessage`, renderizar el `event` recibido
  cuando venga completo; usar `loadFreshEventForRender` solo como respaldo si el llamador no pasa
  roles/participantes. Revisar cada llamador.
- Test: mock de `message.edit` que captura el payload; tras `closeWarSignups` los botones vienen
  deshabilitados.
- Riesgo: bajo-medio.

**1.4 · Scheduler: ticks sin solapamiento y fallos aislados** · D-4 (parcial), D-7 (parcial), D-11
- Cambio: flag de reentrada en `checkAndExecuteEvents` (un tick en curso hace que el siguiente se
  salte); `processScheduledWebPublishes` en su propio try/catch; try/catch por candidato (un fallo de
  BD en el `catch` no corta el bucle).
- Tests: dos `checkAndExecuteEvents()` concurrentes publican una sola vez; un
  `markScheduledPublishAttempt` que lanza no impide procesar el candidato siguiente.
- Riesgo: bajo.

**1.5 · Recurrencia tolerante a minutos perdidos** · D-7
- Cambio: en lugar de exigir `HH:mm` exacto, la ocurrencia está "vencida" si
  `slot ≤ now < fin de esa ocurrencia` y `lastCreatedAt < slot`. Publica una sola vez por ocurrencia.
- Tests: tick en `slot + 3 min` publica una vez; un segundo tick no republica; tick después del fin
  de la ocurrencia no publica; los tests de recurrencia existentes siguen pasando.
- Riesgo: medio (núcleo del scheduler). Si el diseño no encaja limpio con el código, se reporta y se
  difiere.

**1.6 · Republicar solo si el mensaje ya no existe** · D-12
- Cambio: `publishOrRefresh` publica un mensaje nuevo solo si el estado es `missing_message`; con
  otros errores devuelve el error sin duplicar.
- Test: un `edit` que lanza 500 no llama a `send`.
- Riesgo: bajo.

**1.7 · Ciclos que cruzan medianoche** · D-10
- Cambio: en `eventLifecycleTimes`, si `signupCloseAt ≤ publishAt` se desplaza +24 h, y `eventEndAt`
  se calcula respecto del cierre.
- Test: publicación 23:30, cierre 00:15, fin 00:45 en America/Bogota.
- Riesgo: bajo.

**1.8 · Import JSON no destructivo** · D-8, A-3
- Cambio: abortar si `wars.json` no existe o no parsea; exigir `--force` si la base ya tiene eventos;
  copiar la base con `VACUUM INTO data/backups/…` antes de importar.
- Test: import sin `wars.json` se rechaza y `event.count()` no cambia.
- Riesgo: bajo.

**1.9 · Arranque y apagado limpios** · D-17, C-18, C-7 (parte de `index.js`)
- Cambio (`src/index.js`): `shutdown()` = `stopScheduler()` → esperar el tick en curso →
  `client.destroy()` → `shutdownPersistence()`; handlers de `unhandledRejection` y
  `uncaughtException` que registran el error; validar `TOKEN` y `DATABASE_URL` al arrancar con un
  mensaje claro; el `catch` global no llama `interaction.reply` en un autocomplete.
- Test: unit de que `shutdown` espera la promesa del tick.
- Riesgo: bajo.

**1.10 · SQLite en modo WAL** · D-13, A-2, S-11
- Cambio: en `src/db/init.js`, `PRAGMA journal_mode=WAL` al iniciar (persistente en el archivo;
  beneficia también al proceso del dashboard).
- Test: smoke que verifica `PRAGMA journal_mode` = `wal` tras inicializar.
- Riesgo: bajo. Genera archivos `-wal`/`-shm` (ya ignorados por `.gitignore`).

### Fase 2 — Interacciones del bot (`bot-interaction`)

| Ítem | IDs | Cambio | Test de regresión |
|------|-----|--------|-------------------|
| 2.1 | C-2 | `normalizeTimeZoneInfo` cachea el resultado completo (`{timezone, source}`); limitar el tamaño de la caché | Dos llamadas con `America/Bogota` → ninguna `fallback`; `Foo/Bar` → `fallback` las dos veces |
| 2.2 | H-5 | Helper `buildModalTitle(prefix, name)` que recorta el título completo a 45; recortar `setValue` a `maxLength` en todos los modales | Cada handler que abre modal, con nombre de 90 caracteres → `showModal` llamado y título ≤ 45 |
| 2.3 | C-11 | `truncate()` respeta `max` (`slice(0, max - 3) + '...'`) | `truncate('x'.repeat(200), 100).length ≤ 100`; selector con nombre de 90 no lanza |
| 2.4 | H-4 | El store trata `null` explícito como reset (`hasOwnProperty`) en `selectedRoleIndex` y los `pending*` | Contexto de A con índice 2 → seleccionar B → índice `null` → "Eliminar" responde "Primero selecciona un rol" sin escribir |
| 2.5 | H-15, C-9 | Guard central de admin para `panel_event_*`, `panel_pve_*` y modales admin; TTL de 30 min en el contexto (usa `updatedAt`, que ya se guarda) | Miembro sin admin con contexto → denegado sin escritura; contexto vencido → se ignora |
| 2.6 | C-3 | `/fakeuser`: `setDefaultMemberPermissions(Administrator)` + `isAdminExecutor` | No admin → rechazo |
| 2.7 | H-8 | Si el refresco del mensaje falla tras persistir, registrar warning y continuar (`followUp` y `notifyPromotion` sí se ejecutan) | `updateEventDiscordMessage` → `{ok:false}`: igual se responde "Te uniste" y se notifica la promoción |
| 2.8 | H-11, C-15 | Subir slots (panel y `/eventadmin role_slots`) promueve de la waitlist con `promoteFromWaitlist` + `notifyPromotion`; borrar un rol limpia su waitlist | 3 en waitlist, slots +3 → los 3 en `role.users`, waitlist vacía |
| 2.9 | H-10 | Re-clic en un rol lleno estando ya en su waitlist responde `waitlist_exists` sin mover la posición (la rama que el código ya prevé) | Dos clics en rol lleno → misma posición |
| 2.10 | H-18 | `clearDraftSession(userId)` antes de crear un borrador nuevo | `scheduleTemp` previo → tras crear, `getScheduleTemp` es `null` |
| 2.11 | C-6 | `parseEmojiInput` exige un solo grafema emoji (o emoji custom); `toButtonEmoji` con respaldo seguro | `'hola ✅'` → `null`; `'✅'`, `'❤️'`, `'<:a:123456789012345678>'` válidos |
| 2.12 | C-7 | Helper `replyOrEdit` usado en los `catch` de comandos (usa `editReply` si ya se difirió) | `deferReply` + error → `editReply` con el mensaje de error |
| 2.13 | C-14 | Listados (`schedule view`, plantillas) truncados a 2000 con "y N más" | 30 eventos con nombre de 90 → respuesta ≤ 2000 |
| 2.14 | C-16 | `register-commands`: abortar con código ≠ 0 si un comando falla al cargar (antes del `PUT`); código ≠ 0 si falla cualquier guild; validar `TOKEN` | Comando roto → salida ≠ 0 sin llamar a `put` |
| 2.15 | C-21 | `notifyPromotion` con `allowedMentions: { users: [promovido] }` | `roleName` con `<@999>` no aparece en `allowedMentions.users` |
| 2.16 | H-9, C-4 | `MAX_ROLES = 20` (5 filas de botones) validado en las entradas (modal masivo, panel, `/eventadmin role_add`); nombres de rol únicos sin distinguir mayúsculas; slots 1–999 en todos los caminos. Eventos existentes no se tocan | 21 roles o duplicados → rechazo con mensaje claro |
| 2.17 | H-13 | El join valida también `Date.now() < closesAt` (War y PvE) | `closesAt` pasado → respuesta "cerrado" |
| 2.18 | H-17 | Ediciones de serie: calcular y validar todas las ocurrencias antes de guardar ninguna | Serie de 3 con la tercera inválida → ninguna cambia |
| 2.19 | C-13, D-19 | Garmoth: validar el host tras redirecciones (`response.url`), cuerpo máximo 3 MB, no pisar datos con `null` si el parseo falla, cooldown por usuario en `link`/`refresh` | URL no Garmoth → `failed` sin fetch; refresh fallido conserva los campos |
| 2.20 | H-19 | `customId` de panel desconocido → respuesta efímera "Acción no disponible" | `panel_xyz` → respuesta efímera |
| 2.21 | C-10 | `hourCycle: 'h23'` en `getZonedDateParts` (endurecimiento; no es un bug en Node 24) | `shouldExecute` a las 00:30 → `true` |
| 2.22 | H-6 (parcial) | `deferUpdate()` al inicio de los handlers que hacen REST o publican series **y nunca abren un modal**; `updateWithContext` usa `editReply` si ya se difirió | Orden de llamadas: `deferUpdate` antes de `updateWar`/publicación. Si un handler no encaja con seguridad, se salta y se reporta |

### Fase 3 — Dashboard (`dashboard`)

| Ítem | IDs | Cambio | Verificación |
|------|-----|--------|--------------|
| 3.1 | S-3, U-8 | PATCH de evento ignora `messageId`, `publishError`, `lastPublishAttemptAt`; `channelId` validado como snowflake y contra los canales del guild (como en POST); el adaptador REST rechaza ids que no cumplan `^\d{17,20}$`. En la UI, `messageId` de solo lectura | Unit de `parseEventPatch` y del adaptador; tsc + build |
| 3.2 | S-4, A-13 | Cookie de guilds verificados con `userId` (rechazada si no coincide con la sesión); no se re-firma con datos que vienen de la propia cookie; `crypto.timingSafeEqual`; sin secreto fijo en producción (en desarrollo se mantiene un respaldo con aviso); se borra al cerrar sesión | Unit: decode con otro `userId` → `null`; firma alterada → `null` |
| 3.3 | S-7 | Guardar `provider` en el JWT y exigir `discord` en los guards de guild | Unit del guard con sesión Google → 401 |
| 3.4 | S-8 | Mapear errores de Prisma (P2002 → 409) y devolver mensajes genéricos en el resto | Unit del mapeo |
| 3.5 | S-9 (parcial) | Body `null`/no-objeto → 400; `reorder` con longitud máxima 100 y posiciones únicas | Unit de los parsers |
| 3.6 | S-10 | PATCH de slot de plantilla: separar `allowedRoleIds` y reemplazar `eventTemplateRolePermission` (como en slots de evento) | Unit/integración del data layer |
| 3.7 | S-12 | Publicar rechaza eventos cerrados o expirados (409); try/catch con respuesta JSON; validar el canal una sola vez | Unit con mocks; tsc + build |
| 3.8 | S-13 | `fetchBotGuildIds` paginado con `after`; caché global corta (60 s) con single-flight | Unit con 250 guilds en 2 páginas |
| 3.9 | S-5 | Miembros de Discord: caché con TTL (5 min) y concurrencia limitada (5) | Unit: 100 participantes → ≤ 5 en vuelo, segunda carga sin fetch |
| 3.10 | S-14 | Conteos con `_count`/`count` en lugar de cargar relaciones | Conteos idénticos antes/después en test |
| 3.11 | S-20 | Listado de eventos: abiertos primero y luego los más recientes (`closesAt desc`), mismo `take` | Unit/integración |
| 3.12 | U-1 | `pattern` de hora correcto en el editor de plantillas | build; revisar el HTML generado |
| 3.13 | U-2 | Al abrir un slot el borrador de roles parte de `slot.allowedRoleIds`; se limpia al cancelar y al guardar | tsc + build |
| 3.14 | U-3, U-6 (parcial) | Validar la zona en el asistente con error visible y enviarla sin normalizar (el servidor ya valida); "Add time option" propone una hora libre | tsc + build |
| 3.15 | U-5 | No rehabilitar "Create draft" tras un envío exitoso | tsc + build |
| 3.16 | U-7 | `router.refresh()` tras cerrar/reabrir | tsc + build |
| 3.17 | U-4 | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/guilds/[guildId]/loading.tsx` (sin middleware) | build |
| 3.18 | U-15 | Mover `RoleMultiSelect`/`ChannelSelect` (y su CSS) a `components/` compartido | `next build`: First Load JS de `/guilds/[guildId]/events/[eventId]` baja de 168 kB |
| 3.19 | U-24 | `spectreFadeUp` accesible desde los CSS Modules (`:global` o keyframes locales) | CSS compilado contiene los keyframes referenciados |

### Integración I (orquestador)

Merge de las ramas de las fases 1 → 2 → 3 en `chore/pnpm-and-audit`, resolviendo conflictos;
`pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm test`, cobertura, `tsc`, `next build`.
Commit de merge por fase.

### Fase 4 — Coherencia caché/BD y concurrencia (`bot-core`)

**4.1 · Lectura puntual desde la BD** · D-3, S-2, H-2, A-1
- `getWarByMessageId`: si no está en caché, buscar ese evento en SQLite y meterlo en la caché.
- `updateWarByMessageId`: dentro de `withEventLock`, releer el evento desde SQLite antes de aplicar el
  updater (siempre fresco; una consulta indexada por clic).
- Tests (integración): evento con `messageId` creado por Prisma por fuera → el join funciona;
  nombre cambiado por fuera → tras un join el nombre se mantiene.

**4.2 · Mutaciones atómicas en vez de copias completas** · H-3, C-8, D-4
- `updateWarById(id, mutator)`: relee dentro de `withEventLock`, aplica el mutator, persiste.
- Migrar a mutators los handlers del panel admin (`eventAdminPanelActions`, `eventAdminModalActions`),
  `/eventadmin` (`role_*`, `lock`, `unlock`, `recap`) y las rutas del scheduler (cierre, recap,
  expiración). El mutator solo toca los campos de admin; busca el rol por nombre/índice sobre la copia
  fresca.
- Tests: un join concurrente durante una edición del panel (refresco diferido con una promesa) → el
  participante sigue; igual con el cierre automático.
- Riesgo: medio (≈ 25 handlers). Se hace por grupos, con un commit por grupo.

**4.3 · Lecturas sin clonar todo** · D-15, H-16, C-23
- Índice `Map` por `id` y `messageId`; los getters clonan solo el evento encontrado; el autocomplete
  no llama `loadWarsFresh` en cada tecla.
- Test: spy de que `getWarByMessageId` no normaliza todos los eventos. Micro-benchmark antes/después
  con 2.000 eventos (se reporta el resultado).

**4.4 · Índices** · D-16
- Migración nueva: `@@index([guildId, eventType])`; quitar los índices duplicados por `@unique`.
- Verificación: migración aplicada por el harness; `EXPLAIN QUERY PLAN` de la consulta del dashboard.

**4.5 · Orden de inscripción estable** · D-14
- Conservar `joinedAt` de los participantes en el dominio y ordenar por `joinedAt`.
- Test: inscribir B y luego A, recargar → orden B, A.

### Fase 5 — Tooling, higiene y documentación (`bot-interaction`)

| Ítem | IDs | Cambio |
|------|-----|--------|
| 5.1 | A-14 | `package.json`: `private: true`, `license: MIT` (como `LICENSE`), `engines.node >= 20` (lo que exige Vitest 4), quitar `main` y `node-cron`; dashboard declara `server-only`. Verificar que `prisma`/`@prisma/client` quedan alineados |
| 5.2 | A-4 | ESLint (flat config) para el bot y `eslint-config-next` para el dashboard, **reglas en `warn`** (no bloquea, solo informa); scripts `lint`, `typecheck`, `check`, `dashboard:dev`, `dashboard:build` |
| 5.3 | A-8, A-16 | `vitest.config.js`: alias `@` y stub `server-only`; `coverage.include` de `src/**` y `apps/dashboard/lib/**` (cobertura honesta; el número baja pero es real) |
| 5.4 | A-4 | `.github/workflows/ci.yml`: install `--frozen-lockfile`, `db:generate`, `lint`, `typecheck`, `test`, build del dashboard (no se ejecuta hasta que se haga push) |
| 5.5 | A-13, A-23 | `.env.example` completo (incluye `NODEWARBOT_DATA_DIR`), `apps/dashboard/.env.example`, `.gitignore` con `*.db`/`*.db-*`, `.nvmrc`, `.editorconfig` |
| 5.6 | A-15 | `scripts/backup-db.js` (`VACUUM INTO data/backups/` con retención) y script `db:backup` |
| 5.7 | A-20, C (código muerto), S-19 | Borrar `src/utils/timezoneHelper.js`, funciones sin uso de `cronHelper`, `requireGuildAdmin`; cada borrado verificado con Grep en todo el repo |
| 5.8 | A-22 | README: estructura real, sección de despliegue y backups; README del dashboard: API real y modelo de autorización real |

### Integración II y Fase 6 — Verificación final

1. Merge de las fases 4 y 5; `pnpm install --frozen-lockfile`, `db:generate`, suite completa,
   cobertura, `tsc`, `next build`, `pnpm lint` (informe de warnings).
2. Revisión independiente del diff completo por el agente `reviewer` (Opus): correctness, regresiones,
   desvíos del plan.
3. Skill `security-review` sobre los cambios de la rama.
4. Corrección de lo que surja (con el mismo protocolo).
5. Tabla final antes/después: tests, cobertura, duración, tamaños de build, hallazgos cerrados.
6. Actualizar `AUDIT.md` con el estado de cada hallazgo.

## 5. Criterios de aceptación globales

- Todos los tests pasan (≥ 141 + los nuevos), incluidos los 2 que hoy fallan.
- `tsc --noEmit` del dashboard sin errores y `next build` OK.
- First Load JS de `/guilds/[guildId]/events/[eventId]` menor que 168 kB.
- Ningún cambio de reglas de producto sin aprobación (§5 de `AUDIT.md`).
- Cada ítem tiene su commit y su test; nada se hace push.

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Romper flujos de Discord sin cobertura (handlers al 24 %) | Test de regresión por ítem; cambios mínimos; Fase 4 por grupos |
| Conflictos entre agentes | Worktrees separados y propiedad de archivos disjunta |
| No poder probar contra Discord ni el login OAuth real | Mocks de discord.js en tests; lo que requiere prueba real queda marcado como "verificar manualmente" en el informe final |
| Cambiar comportamiento sin querer | Revisión del diff completo por un agente independiente + revisión del orquestador en cada integración |

## 7. Fuera de alcance de esta pasada (con motivo)

- **Partir los archivos monolíticos** (`eventAdminPanelActions.js`, `NewEventForm.tsx`,
  `dashboardData.ts`): diff enorme con cobertura de ramas del 12 %; requiere primero tests de
  caracterización.
- **Mover a `src/domain/`, paquete compartido bot/dashboard, puente `exports`** (A-5, A-6, A-9):
  cambios estructurales sin beneficio inmediato para el usuario; se dejan diseñados en `AUDIT.md` §6.
- **Accesibilidad profunda** (U-10..U-13), **rediseño de layout** (U-20, U-21), **CSS** (U-26),
  **imágenes** (U-25): mejoras de UI amplias que requieren revisión visual.
- **Harness de tests paralelo** (A-7): útil para la velocidad, pero toca toda la infraestructura de
  tests; mejor en una pasada propia.
- Todo lo listado como decisión de producto en `AUDIT.md` §5.
