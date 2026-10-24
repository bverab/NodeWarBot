# Plan de acción — correcciones de la auditoría

Complemento de [`AUDIT.md`](AUDIT.md). Cada ítem cita los IDs de hallazgo que resuelve.
Versión 2: incorpora la revisión independiente del plan (13 correcciones obligatorias y 14
recomendadas, verificadas contra el código).

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
8. **Ítem marcado "si encaja"**: se implementa solo si el diseño entra limpio en los archivos
   asignados y con tests convincentes; si no, se difiere y se reporta con el motivo.

## 2. Protocolo

### Preparación de cada worktree (una vez)

```
# En cada llamada de PowerShell, primero recargar el PATH (git/node/pnpm no están en el PATH heredado):
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
pnpm install --frozen-lockfile     # node_modules no está en git
pnpm db:generate                   # los scripts de instalación de Prisma están denegados
pnpm test                          # confirmar línea base: 139/141 (2 fallos conocidos de D-1)
```

Los tests se ejecutan siempre desde la raíz del worktree: `tests/setup/env.js` y el harness usan
`process.cwd()`, así que cada worktree tiene su propia SQLite de test.

### Por ítem

```
1. Leer el código y confirmar el hallazgo (si no se confirma → "descartado", siguiente ítem).
2. Escribir el test de regresión y ejecutarlo: debe FALLAR por la razón esperada.
3. Implementar el cambio mínimo, en el estilo del código vecino.
4. Ejecutar el test nuevo (pasa) y luego la suite completa (sin regresiones).
5. Dashboard tocado → pnpm --filter @spectre/dashboard exec tsc --noEmit -p .  y  next build.
6. Commit atómico con los IDs (git -c user.name=bverab -c user.email=bastian.verar@ug.uchile.cl commit ...).
7. Anotar en el reporte: ID, archivos, test, comandos ejecutados y resultado.
```

### Tests

- No hay fakes compartidos de discord.js y `vi.mock` no intercepta `require` de CommonJS: seguir el
  patrón existente `vi.resetModules()` + parchear exports del módulo
  (`tests/unit/buttonHandler.pve.unit.test.js:27-43`). Para insertar filas "por fuera de la caché"
  basta `prisma` directo (`schedulerRecurrence.integration.test.js:285-316`).
- Archivos de test nuevos con prefijo por agente para evitar choques al integrar:
  `core.*.test.js`, `interaction.*.test.js`, `dashboard*.test.ts`.
- La fase 2 puede crear fakes propios en `tests/support/interaction/` (no toca `tests/helpers`).
- En las fases 2 y 3, los 2 fallos de D-1 son esperados hasta la Integración I.

## 3. Organización: fases, agentes y propiedad de archivos

Cada agente de implementación trabaja en **su propio git worktree**. El orquestador integra las
ramas, corre la verificación completa y hace los merges.

| Fase | Agente | Modelo | Paralelo con | Archivos que puede editar |
|------|--------|--------|--------------|---------------------------|
| 1 | `bot-core` | Opus | 2, 3 | `src/utils/warState.js`, `src/utils/eventLifecycleTimes.js`, `src/db/**`, `src/services/**` (excepto `garmothProfileService.js`), `src/commands/event/eventAdmin.js`, `src/index.js`, `scripts/**`, `tests/helpers/**`, `tests/factories/**`, tests `core.*` y los tests existentes de esas áreas |
| 2 | `bot-interaction` | Sonnet | 1, 3 | `src/handlers/**`, `src/commands/**` (excepto `event/eventAdmin.js`), `src/utils/**` (excepto `warState.js` y `eventLifecycleTimes.js`), `src/services/garmothProfileService.js`, `src/register-commands.js`, `src/constants/**`, `tests/support/interaction/**`, tests `interaction.*` y los tests existentes de esas áreas |
| 3 | `dashboard` | Sonnet | 1, 2 | `apps/dashboard/**`, `tests/**/dashboard*.ts` |
| I | orquestador | — | — | Integración 1 → 2 → 3 y verificación completa |
| 4 | `bot-core` (continúa) | Opus | 5 | `src/db/**`, `src/services/**`, `src/handlers/**`, `src/commands/**`, `src/utils/warState.js`, `prisma/**`, tests |
| 5 | `bot-interaction` (continúa) | Sonnet | 4 | `package.json`, `pnpm-lock.yaml`, `apps/dashboard/package.json`, `vitest.config.js`, `eslint.config.*`, `.github/**`, `.gitignore`, `.env.example`, `apps/dashboard/.env.example`, `.nvmrc`, `.editorconfig`, `README.md`, `apps/dashboard/README.md`, `scripts/backup-db.js`, código muerto listado en 5.7 |
| II | orquestador | — | — | Integración 4 + 5 y verificación completa |
| 6 | `reviewer` (continúa) | Opus | — | Solo lectura: revisión del diff completo |

Total de agentes: 6 auditores + revisor + 3 implementadores = **10**.

## 4. Fases e ítems

### Fase 1 — Integridad de datos del bot (`bot-core`)

**1.1 · `normalizeWar` idempotente con prioridad de campos canónicos** · D-1, H-1, D-5, bug `publishAt`
- Cambio (`src/utils/warState.js`):
  - `createdAt = war.createdAt` si es finito, si no `war.publishAt`, si no `deriveCreatedAt`.
    Igual `expiresAt` (canónico, luego `eventEndAt`) y `closesAt` (canónico, luego `signupCloseAt`).
    Los alias quedan solo como **entrada de respaldo** para JSON antiguo.
  - `scheduledPublishAt` solo desde `war.scheduledPublishAt` (nunca desde `publishAt`).
  - No emitir `publishAt`/`signupCloseAt`/`eventEndAt` en el objeto normalizado. Verificado por la
    revisión: nadie los lee de un evento (solo de objetos `lifecycle`, que no se tocan). Consecuencia
    documentada: `db:export-json` deja de emitir esos alias (eran iguales a los canónicos).
  - `dayOfWeek`: entero 0–6 (también los strings `"0"`–`"6"`) → número; cualquier otra cosa,
    incluidos `null`/`undefined`/fuera de rango → `null`.
  - **`createSeriesWarFromSource`** (`src/services/recurrenceSeriesService.js:85-111`): hoy hereda,
    vía los alias, las horas absolutas del evento origen. Copiar explícitamente
    `createdAt`/`closesAt`/`expiresAt` del origen para conservar exactamente el comportamiento
    efectivo actual.
- Tests:
  - Unit: `normalizeWar(normalizeWar(x))` igual a `normalizeWar(x)` para una tabla de entradas (con y
    sin alias, con `scheduledPublishAt ≠ createdAt`, con `dayOfWeek: null`, `"3"`, `9`).
  - Unit: `applyLifecycleToWar({...normalizeWar(x)}, lc)` y luego `normalizeWar` conserva las horas de `lc`.
  - Integración: `createWar` de un borrador programado → `prisma.event.findUnique` conserva
    `scheduledPublishAt`; igual tras `updateWar(loadWars()[0])` y tras `loadWarsFresh()`.
  - Integración (`schedulerRecurrence`): tras republicar la semana 2, `expiresAt > nextWeekSlot`, y un
    tick 2 minutos después no cierra ni expira el evento.
  - Integración: `addSeriesDays` conserva `formatTimeInEventZone(closesAt)` y `(expiresAt)` del origen.
- Informe: añadir una consulta para detectar borradores ya dañados en producción
  (`scheduledPublishAt = createdAt` con `autoPublishEnabled = true`).
- Aceptación: pasan los 2 tests hoy rotos y los nuevos.

**1.2 · Eliminar el reemplazo total de la base en producción** · D-2, C-1, S-1
- Cambio:
  - `deleteWarById(id)` en el repositorio (dentro de `withEventLock`; borra la fila con cascada y la
    quita de la caché), expuesto por `warService`.
  - `replaceWarId(oldId, newWar)` en el repositorio: en **una sola `$transaction`** y bajo los locks de
    ambos ids, borra el evento viejo y hace upsert del nuevo (en ese orden, porque `messageId` es
    `@unique` y la copia lo conserva); actualiza la caché.
  - `handleScheduleCancel` (`src/commands/event/eventAdmin.js`): exige admin con
    `deps.isAdminExecutor` (ya se inyecta en `src/commands/event/index.js:204`) y usa `deleteWarById`.
    **Se mantiene la semántica** (cancelar = borrar ese evento). `handleScheduleView` **no** cambia de
    permisos (decisión de producto, ver `AUDIT.md` §5); sí se trunca su respuesta a 2000 caracteres
    con "y N más" (C-14).
  - `removeSeriesDay`: `deleteWarById(target.id)`. `editSeriesDay` con cambio de id: `replaceWarId`, y
    los slots PvE se copian como hoy.
  - Quitar `saveWars` de `warService` (sin uso en producción tras el cambio); el harness sigue usando
    la del repositorio, documentada como utilidad de test/importación.
- Tests (integración): con dos eventos PvE con inscripciones (distintos del que se mueve: mover un día
  PvE pierde sus propias inscripciones también hoy) y un evento insertado directo con Prisma:
  cancelar un tercer evento, quitar un día y mover un día dejan intactos los conteos de
  `eventEnrollment`, `eventOption` y el evento externo. Unit: un no admin en `schedule cancel` no
  borra nada (actualizar `tests/unit/eventScheduleAdmin.unit.test.js` para inyectar
  `isAdminExecutor`).
- Riesgo: medio (flujos de series). Cubierto por los tests de series existentes.

**1.3 · Persistir antes de renderizar** · D-6
- Cambio: la caché sigue siendo la fuente por defecto del render (protege los clics concurrentes de
  `buttonHandler`). Se corrigen los dos llamadores que editan el mensaje **antes** de persistir:
  `closeWarSignups` en `schedulerService.js:466-482` y la rama `activate` de
  `eventPublicationService.js:116-127`: persistir primero y editar después.
- Test: mock de `message.edit` que captura el payload; tras `closeWarSignups` los botones vienen
  deshabilitados; tras activar, el estado mostrado es el nuevo.
- Riesgo: bajo. El dashboard no cambia (en el proceso de Next la caché nunca se inicializa).

**1.4 · Scheduler: tick single-flight y fallos aislados** · D-4 (parcial), D-7 (parcial), D-11
- Cambio: `checkAndExecuteEvents` guarda la promesa del tick en curso y, si se llama mientras corre,
  **devuelve esa misma promesa** (no la salta: `initScheduler` lanza un tick sin `await` y los tests
  esperan el siguiente). `processScheduledWebPublishes` en su propio try/catch; try/catch por
  candidato.
- Tests: dos llamadas concurrentes publican una sola vez y ambas resuelven tras el trabajo; un
  `markScheduledPublishAttempt` que lanza no impide procesar el candidato siguiente.
- Riesgo: bajo.

**1.5 · Recurrencia tolerante a minutos perdidos (si encaja)** · D-7
- Solo en `schedulerService.js` y `eventLifecycleTimes.js` (`cronHelper.js` es de la fase 2).
- Condición: `lc` = ciclo de vida de la ocurrencia de la fecha local más reciente ≤ `now` con ese
  `dayOfWeek` (en la zona del evento). Publicar si se cumplen las tres:
  1. `lc.publishAt ≤ now < lc.signupCloseAt` (cota en el cierre, no en el fin);
  2. `war.createdAt < lc.publishAt` (el evento aún no representa esta ocurrencia);
  3. `fechaLocal(schedule.lastCreatedAt, tz) ≠ fechaLocal(lc.publishAt, tz)` (el guard "mismo día"
     actual, pero en la zona del evento: evita republicar si el admin ya publicó a mano ese día).
- Pasar `lc` a `executeWarPublication` en vez de derivarlo con `now - 60 s` (hoy un tick tardío
  calcularía las horas de la semana siguiente).
- Si es seguro, publicar el mensaje nuevo **antes** de borrar el viejo y resetear PvE; si no, dejarlo
  como está y reportarlo.
- Tests: tick en `slot + 3 min` publica una vez con las horas de esa ocurrencia; segundo tick no
  republica; tick después del cierre no publica; publicación manual previa el mismo día no se
  duplica; todos los tests de recurrencia existentes pasan.
- Riesgo: medio. Si no encaja limpio, se difiere.

**1.6 · Republicar solo si el mensaje ya no existe** · D-12
- `publishOrRefresh` publica un mensaje nuevo solo si el estado es `missing_message`; con otros
  errores devuelve el error sin duplicar.
- Test: un `edit` que lanza 500 no llama a `send`.

**1.7 · Ciclos que cruzan medianoche** · D-10
- Si `signupCloseAt ≤ publishAt` y el cierre desplazado +24 h queda **a 6 h o menos** de la
  publicación, desplazarlo (y calcular `eventEndAt` respecto del cierre). Fuera de ese margen se
  mantiene el error de validación actual (protege erratas como publicar 20:00 / cerrar 08:00). El
  umbral se documenta en el informe como parámetro revisable.
- Test: publicación 23:30, cierre 00:15, fin 00:45 en America/Bogota → válido; 20:00/08:00 → error.

**1.8 · Import JSON no destructivo** · D-8, A-3
- Comprobación **estricta** de existencia y parseo de `wars.json` **antes** del backup (hoy
  `ensureJsonFile` crea `[]`, `readArrayJsonFile` se traga errores de parseo y
  `backupLegacyJsonFiles` también crea el archivo).
- Opción `force` en `importJsonToSqlite` y parseo de `--force` en `scripts/migrate-json-to-sqlite.js`;
  sin `--force`, abortar si la base ya tiene eventos.
- Backup de la base con `VACUUM INTO` bajo `getDataDirPath()/backups` antes de importar.
- Test: import sin `wars.json` → rechazo y `event.count()` intacto; JSON inválido → rechazo.
- Diferido (documentado): el export no incluye PvE ni plantillas.

**1.9 · Arranque y apagado limpios** · D-17, C-18, C-7 (catch global)
- Extraer a `src/services/botLifecycleService.js` una función `shutdown({ client })`:
  `stopScheduler()` → esperar la promesa del tick en curso (de 1.4) → `client.destroy()` →
  `shutdownPersistence()`. `src/index.js` solo la cablea a `SIGINT`/`SIGTERM`.
- `index.js`: handlers de `unhandledRejection`/`uncaughtException` que registran el error; validar
  `TOKEN` y `DATABASE_URL` al arrancar con un mensaje claro; el `catch` global no llama
  `interaction.reply` en autocompletes y usa `editReply`/`followUp` si la interacción ya se difirió.
- Test: unit de `shutdown` (orden de llamadas y espera del tick). `index.js` no se importa en tests
  (ejecuta `main()` al cargarse).

**1.10 · SQLite en modo WAL** · D-13, A-2, S-11
- `src/db/init.js`: `await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL')` (un PRAGMA devuelve
  filas; `$executeRaw` falla en SQLite). El harness borra también los archivos `-wal` y `-shm`.
- Test: smoke que verifica `journal_mode` = `wal` tras inicializar.

**1.11 · No inscribirse en PvE después del cierre** · H-13 (parte PvE)
- `joinEventOption` (`src/db/eventOptionRepository.js`, junto a `event.isClosed`): rechazar inscribirse
  si `closesAt` ya pasó, **sin bloquear salir** (el join PvE es un toggle).
- Test: `closesAt` pasado → no se puede entrar, sí se puede salir.

### Fase 2 — Interacciones del bot (`bot-interaction`)

| Ítem | IDs | Cambio | Test de regresión |
|------|-----|--------|-------------------|
| 2.1 | C-2 | `normalizeTimeZoneInfo` cachea el resultado completo (`{timezone, source}`); limitar el tamaño de la caché | Dos llamadas con `America/Bogota` → ninguna `fallback`; `Foo/Bar` → `fallback` las dos veces |
| 2.2 | H-5 | Helper `buildModalTitle(prefix, name)` que recorta el título completo a 45; recortar `setValue` a `maxLength` en todos los modales | Cada handler que abre modal, con nombre de 90 caracteres → `showModal` llamado y título ≤ 45 |
| 2.3 | C-11 | `truncate()` respeta `max` (`slice(0, max - 3) + '...'`) | `truncate('x'.repeat(200), 100).length ≤ 100`; selector con nombre de 90 no lanza |
| 2.4 | H-4 | El store trata `null` explícito como reset (`hasOwnProperty`) en `selectedRoleIndex` y los `pending*` | Contexto de A con índice 2 → seleccionar B → índice `null` → "Eliminar" responde "Primero selecciona un rol" sin escribir |
| 2.5 | H-15, C-9 | Guard de admin **en el despacho** (`interactionHandler.js` y `modalHandler.js`) para `panel_event_*`, `panel_pve_*` y modales admin, **excluyendo `ROLE_PANEL_ACTIONS`** (`panel_*` del borrador, de uso público). TTL de 30 min en el contexto (usa `updatedAt`) | Miembro sin admin con contexto → denegado sin escritura; contexto vencido → se ignora; los tests de acciones existentes siguen pasando |
| 2.6 | C-3 | `/fakeuser`: `setDefaultMemberPermissions(Administrator)` + `isAdminExecutor`. Requiere volver a ejecutar `pnpm register` (anotarlo en el informe) | No admin → rechazo |
| 2.7 | H-8 | Si el refresco del mensaje falla tras persistir, registrar warning y continuar (`followUp` y `notifyPromotion` sí se ejecutan) | `updateEventDiscordMessage` → `{ok:false}`: igual se responde "Te uniste" y se notifica la promoción |
| 2.8 | H-11, C-15 | Subir slots (panel y `/eventadmin role_slots`) promueve de la waitlist con `promoteFromWaitlist` + `notifyPromotion`; borrar un rol limpia su waitlist | 3 en waitlist, slots +3 → los 3 en `role.users`, waitlist vacía |
| 2.9 | H-10 | Re-clic en un rol lleno estando ya en su waitlist responde `waitlist_exists` sin mover la posición (la rama que el código ya prevé) | Dos clics en rol lleno → misma posición |
| 2.10 | H-18 | `clearDraftSession(userId)` antes de crear un borrador nuevo | `scheduleTemp` previo → tras crear, `getScheduleTemp` es `null` |
| 2.11 | C-6 | `parseEmojiInput` exige un solo grafema emoji (o emoji custom); `toButtonEmoji` con respaldo seguro | `'hola ✅'` → `null`; `'✅'`, `'❤️'`, `'<:a:123456789012345678>'` válidos |
| 2.12 | C-7 | Helper `replyOrEdit` usado en los `catch` de los comandos (usa `editReply` si ya se difirió) | `deferReply` + error → `editReply` con el mensaje de error |
| 2.13 | C-14 | Listado de plantillas (`eventTemplate.js`) truncado a 2000 con "y N más" (el de `schedule view` va en 1.2) | 30 plantillas con nombre largo → respuesta ≤ 2000 |
| 2.14 | C-16 | `register-commands.js`: exportar una función con `commandsPath` inyectable y guard `require.main === module`; abortar con código ≠ 0 si un comando falla al cargar (antes del `PUT`); código ≠ 0 si falla cualquier guild; validar `TOKEN` | Comando roto → error sin llamar a `put` |
| 2.15 | C-21 | `notifyPromotion` con `allowedMentions: { users: [promovido] }` | `roleName` con `<@999>` no aparece en `allowedMentions.users` |
| 2.16 | H-9, C-4 | `MAX_ROLES = 20` (5 filas de botones) validado en las entradas (modal masivo, panel, `/eventadmin role_add`); nombres de rol únicos sin distinguir mayúsculas; slots 1–999 en todos los caminos. Eventos existentes no se tocan | 21 roles o duplicados → rechazo con mensaje claro |
| 2.17 | H-13 (War) | Join de War: rechazar **entrar** si `Date.now() ≥ closesAt`, después de la rama de salida (salir sigue permitido) | `closesAt` pasado → no entra; sí sale |
| 2.18 | H-17 | Ediciones de serie: calcular y validar todas las ocurrencias antes de guardar ninguna | Con `updateWar` mockeado (D-1 se arregla en paralelo): serie de 3 con la tercera inválida → ninguna escritura |
| 2.19 | C-13, D-19 (parcial) | Garmoth: validar el host tras redirecciones (`response.url`), cuerpo máximo 3 MB, no pisar datos con `null` si el parseo falla, cooldown por usuario en `link`/`refresh`. La parte de repositorio de D-19 queda fuera | URL no Garmoth → `failed` sin fetch; refresh fallido conserva los campos |
| 2.20 | H-19 | `customId` de panel desconocido → respuesta efímera "Acción no disponible" | `panel_xyz` → respuesta efímera |
| 2.21 | C-10 | `hourCycle: 'h23'` en `getZonedDateParts` (endurecimiento; no es un bug en Node 24) | `shouldExecute` a las 00:30 → `true` |
| 2.22 | H-6 (parcial, si encaja) | `deferUpdate()` al inicio de los handlers que hacen REST o publican series **y nunca abren un modal**; `updateWithContext` usa `editReply` si ya se difirió | Orden de llamadas: `deferUpdate` antes de `updateWar`/publicación. Si un handler no encaja con seguridad, se salta y se reporta |

### Fase 3 — Dashboard (`dashboard`)

| Ítem | IDs | Cambio | Verificación |
|------|-----|--------|--------------|
| 3.1 | S-3, U-8 | **Se conserva** la edición de `messageId` en borradores (es una función intencional), pero validada: snowflake `^\d{17,20}$` y el mensaje debe existir en ese canal y ser del bot. `channelId` validado como snowflake y contra los canales del guild (como en POST). PATCH ignora `publishError` y `lastPublishAttemptAt`. El adaptador REST rechaza ids que no sean snowflakes | Unit de `parseEventPatch` y del adaptador; actualizar `dashboardMutationValidation.unit.test.ts` y `dashboardDiscordRestEventAdapter.unit.test.ts` (usan `channel_1`/`message_1`); tsc + build |
| 3.2 | S-4, A-13 | Cookie de guilds verificados con `userId` (rechazada si no coincide con la sesión); no se re-firma con datos que vienen de la propia cookie (`events/route.ts:108`); `crypto.timingSafeEqual`; sin secreto fijo en producción (en desarrollo, respaldo con aviso). Borrar la cookie al cerrar sesión solo si NextAuth v4 lo permite; si no, basta el binding a `userId` | Unit: decode con otro `userId` → `null`; firma alterada → `null` |
| 3.3 | S-7 | Guardar `provider` en el JWT al iniciar sesión; en los guards (`guildAccess.ts`) rechazar solo `provider === 'google'` (la ausencia se acepta como sesión antigua, para no cerrar todas las sesiones) | Unit del guard: Google → 401; sin `provider` → igual que hoy |
| 3.4 | S-8 | Mapear errores de Prisma (P2002 → 409) y devolver mensajes genéricos en el resto | Unit del mapeo |
| 3.5 | S-9 (parcial) | Body `null`/no-objeto → 400; `reorder` con longitud máxima 100 y posiciones únicas | Unit de los parsers |
| 3.6 | S-10 | PATCH de slot de plantilla: separar `allowedRoleIds` y reemplazar `eventTemplateRolePermission` (como en slots de evento) | Unit/integración del data layer |
| 3.7 | S-12 | Publicar rechaza eventos cerrados o expirados (409); try/catch con respuesta JSON; validar el canal una sola vez | Unit con mocks; tsc + build |
| 3.8 | S-13 | `fetchBotGuildIds` paginado con `after`; caché global corta (60 s) con single-flight | Unit con 250 guilds en 2 páginas |
| 3.9 | S-5 | Miembros de Discord: caché con TTL (5 min) y concurrencia limitada (5) | Unit: 100 participantes → ≤ 5 en vuelo, segunda carga sin fetch |
| 3.10 | S-14 | Conteos con `_count`/`count` en lugar de cargar relaciones | Conteos idénticos antes/después en test |
| 3.11 | S-20 | Listado: abiertos primero en `closesAt asc` (como hoy) y luego cerrados en `closesAt desc` | Unit/integración |
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
`pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm test` (141/141 + nuevos), cobertura,
`tsc`, `next build`. Re-ejecutar los tests de 2.18 sin mocks una vez integrado 1.1.

### Fase 4 — Coherencia caché/BD y concurrencia (`bot-core`)

Orden obligatorio: 4.1 → 4.2 → 4.3 → 4.4 → 4.5.

**4.1 · Orden de inscripción y campos del dashboard estables** · D-14, D-9
- Conservar `joinedAt` de participantes en el dominio (`warState.js` `toParticipant`/`normalizeRole`),
  no reiniciarlo al reescribir, y leer con `orderBy: { joinedAt: 'asc' }`.
- `normalizeWar` respeta `duration`/`closeBeforeMinutes` de entrada si son válidos (hoy los recalcula
  desde `createdAt`, que en eventos del dashboard es la hora de creación).
- Alinear límites del bot con el dashboard donde Discord lo permite (nombre de evento 120); si un
  límite no se puede alinear (p. ej. etiquetas de botón de 80), documentarlo.
- Tests: inscribir B y luego A, recargar → B, A; evento con `duration` válido y `createdAt` antiguo →
  `duration` intacto tras `updateWar`.

**4.2 · Lectura desde la BD cuando la caché no sabe** · D-3, S-2, H-2, A-1
- Getter **asíncrono nuevo** (`resolveWarByMessageId`): caché, y si no está, SQLite → caché. El getter
  síncrono actual se mantiene para no romper sus usos; `buttonHandler` y los caminos PvE pasan al
  asíncrono (actualizar los tests y mocks que lo usan).
- Migración: `Event.updatedAt` (`@updatedAt`, con valor por defecto para filas existentes). En cada
  tick el scheduler sincroniza la caché con la BD: carga eventos nuevos o con `updatedAt` posterior a
  la última sincronización y quita los borrados. Así el scheduler también cierra, expira y hace recap
  de eventos publicados desde la web.
- `updateWarByMessageId`: dentro del lock, si `updatedAt` en la BD es posterior al de la caché,
  recargar ese evento antes de aplicar el updater.
- Tests: evento creado/publicado por Prisma por fuera → el join funciona y el scheduler lo cierra al
  vencer; nombre cambiado por fuera → tras un join se mantiene; evento borrado por fuera desaparece
  de la caché en el siguiente tick.

**4.3 · Mutaciones atómicas en vez de copias completas** · H-3, C-8, D-4
- `updateWarById(id, mutator)`: relee dentro de `withEventLock`, aplica el mutator, persiste.
- Migrar a mutators, por grupos y con un commit por grupo: panel admin (`eventAdminPanelActions`,
  `eventAdminModalActions`), `/eventadmin` (`role_*`, `lock`, `unlock`, `recap`) y scheduler (cierre,
  recap, expiración). El mutator solo toca los campos de admin y busca el rol sobre la copia fresca.
- `loadWarsFresh` toma el lock global antes de reemplazar la caché.
- Tests: join concurrente durante una edición del panel (refresco diferido con una promesa) → el
  participante sigue; igual con el cierre automático.

**4.4 · Lecturas sin clonar todo** · D-15, H-16, C-23
- Índice `Map` por `id` y `messageId`; los getters clonan solo el evento encontrado; el autocomplete
  no llama `loadWarsFresh` en cada tecla.
- Test: spy de que `getWarByMessageId` no normaliza todos los eventos. Micro-benchmark antes/después
  con 2.000 eventos (se reporta el resultado).

**4.5 · Índices** · D-16
- Migración: `@@index([guildId, eventType])`; quitar los índices duplicados por `@unique`.
- Verificación: migración aplicada por el harness; `EXPLAIN QUERY PLAN` de la consulta del dashboard.

### Fase 5 — Tooling, higiene y documentación (`bot-interaction`)

| Ítem | IDs | Cambio |
|------|-----|--------|
| 5.1 | A-14 | `package.json`: `private: true`, `license: MIT` (como `LICENSE`), `engines.node` `^20 \|\| ^22 \|\| >=24` (lo que exige Vitest 4), quitar `main` y `node-cron`; el dashboard declara `server-only`. Verificar que `prisma` y `@prisma/client` quedan en la misma versión |
| 5.2 | A-4 | ESLint (flat config) para el bot y `eslint-config-next` para el dashboard, **reglas en `warn`** (informa, no bloquea); scripts `lint`, `typecheck`, `check`, `dashboard:dev`, `dashboard:build` |
| 5.3 | A-8, A-16 | `vitest.config.js`: alias `@` y stub `server-only`; `coverage.include` de `src/**` y `apps/dashboard/lib/**` (cobertura honesta: el número puede bajar, pero es real) |
| 5.4 | A-4 | `.github/workflows/ci.yml`: install `--frozen-lockfile`, `db:generate`, `lint`, `typecheck`, `test`, build del dashboard (no corre hasta que se haga push) |
| 5.5 | A-13, A-23 | `.env.example` completo (incluye `NODEWARBOT_DATA_DIR`), `apps/dashboard/.env.example`, `.gitignore` con `*.db`/`*.db-*`, `.nvmrc`, `.editorconfig` |
| 5.6 | A-15 | `scripts/backup-db.js` (`VACUUM INTO data/backups/` con retención) y script `db:backup` |
| 5.7 | A-20, código muerto, S-19 | Borrar `src/utils/timezoneHelper.js`, funciones sin uso de `cronHelper`, `requireGuildAdmin`; cada borrado verificado con Grep en todo el repo |
| 5.8 | A-22 | README: estructura real, despliegue, backups y nota de re-registrar comandos; README del dashboard: API real y modelo de autorización real |

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
| Romper flujos de Discord sin cobertura (handlers al 24 %) | Test de regresión por ítem; cambios mínimos; fase 4 por grupos |
| Conflictos entre agentes | Worktrees separados, propiedad de archivos disjunta, prefijos en tests nuevos |
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
- **Export JSON completo** (PvE y plantillas, parte de D-8) y **repositorio de Garmoth** (parte de D-19).
- Todo lo listado como decisión de producto en `AUDIT.md` §5 (incluye ahora: permisos de
  `schedule view` y la ventana tardía de publicación de 1.5 si se difiere).
