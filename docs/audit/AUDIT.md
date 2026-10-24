# Auditoría de código — NodeWarBot

Fecha: 2026-10-23 · Rama: `chore/pnpm-and-audit` · Base: `76d7fe3` (+ migración a pnpm `dbd4455`)

## 1. Resumen ejecutivo

El proyecto tiene una base sólida (capa `db` aislada, sin dependencias circulares, 141 tests,
dashboard con autorización real por guild), pero hay **cuatro defectos que hoy rompen o destruyen
datos en producción**, todos verificados ejecutando el código:

| # | Defecto | Efecto en producción | Verificación |
|---|---------|----------------------|--------------|
| 1 | `normalizeWar` da prioridad a los alias `publishAt` / `signupCloseAt` / `eventEndAt` sobre los campos reales | Las series recurrentes guardan las horas **de la semana anterior** al republicar; el siguiente tick las cierra y borra el mensaje. Las ediciones de cierre/fin desde el panel no se guardan. `scheduledPublishAt` se pisa con `createdAt`. | ✅ ejecutado |
| 2 | `saveWars()` reemplaza **toda** la base con la caché en memoria | `/event schedule cancel` (sin permisos de admin) o quitar/mover un día de una serie borra **todos los slots e inscripciones PvE de todos los servidores** y todo evento creado desde el dashboard. | 🔍 leído (flujo y cascadas del esquema) |
| 3 | La caché de zonas horarias marca `America/Bogota` (la zona por defecto) como `fallback` desde la segunda vez | `/event create` con la zona por defecto falla con "Zona horaria invalida" después del primer uso tras cada reinicio. | ✅ ejecutado |
| 4 | Títulos de modal de más de 45 caracteres | `showModal` lanza error: con nombres normales (ej. el placeholder "NodeWar Mediah 1 - Valencia 1") no se pueden configurar horarios PvE ni varias acciones del panel. | ✅ ejecutado |

A eso se suman problemas de **coherencia entre el bot y el dashboard** (dos procesos escriben la
misma SQLite y la caché del bot nunca se invalida), **pérdida de inscripciones por escrituras
concurrentes**, y varios **huecos de seguridad en el dashboard** (cookie de permisos no ligada al
usuario, `messageId` editable por el cliente).

### Línea base (antes de cualquier corrección)

| Métrica | Valor |
|---------|-------|
| Tests | 139/141 (los 2 que fallan los causa el defecto #1, introducido en `76d7fe3`) |
| Cobertura (solo archivos cargados por tests) | 49,0 % sentencias · 40,9 % ramas · 55,4 % funciones · 50,9 % líneas |
| Cobertura por área | `src/db` 80 % · `src/services` 65 % · `src/utils` 47 % · `src/handlers` 24 % · `src/commands` 12 % |
| Duración de la suite | ~38 s (serial por diseño: una única SQLite de test) |
| `tsc --noEmit` dashboard | 0 errores |
| `next build` | OK · First Load JS compartido 103 kB · `/events/[eventId]` 168 kB · `/events/new` 158 kB |
| Lint / CI | No existen |

## 2. Metodología

- **6 auditores en paralelo, solo lectura**, cada uno con un área sin solapamiento:

  | Área | Modelo | Prefijo de IDs |
  |------|--------|----------------|
  | Handlers de interacciones (`src/handlers`) | Opus | `H-` |
  | Datos, servicios, scheduler, ciclo de vida (`src/db`, `src/services`, `warState`, `eventLifecycleTimes`, `prisma`, `scripts`) | Opus | `D-` |
  | Comandos, utilidades, entrypoints (`src/commands`, resto de `src/utils`, `index.js`) | Sonnet | `C-` |
  | API, auth y servidor del dashboard (`app/api`, `lib`) | Opus | `S-` |
  | UI del dashboard (`app` sin `api`, `components`, estilos) | Sonnet | `U-` |
  | Arquitectura, tests, tooling, dependencias | Sonnet | `A-` |

- **Verificación propia** de cada hallazgo crítico y alto antes de planificar:
  - ✅ **ejecutado**: reproducido corriendo las funciones reales del repo.
  - 🔍 **leído**: flujo seguido en el código (llamadores, esquema, cascadas).
  - ◻ **reportado**: confianza del auditor; se verifica con un test de regresión antes de corregir.
  - ✖ **descartado**: no se reproduce.
- Los IDs originales se conservan para trazabilidad. Cuando varios agentes reportaron lo mismo,
  se agrupa bajo un ID principal (p. ej. `D-2 = S-1 = C-1 = A-1`).

## 3. Hallazgos críticos

### D-1 · Los alias del ciclo de vida revierten las horas (incluye el bug de `publishAt`, H-1, D-5)
✅ ejecutado. `src/utils/warState.js:95-109,135,141-145,162-164`

`normalizeWar` calcula `createdAt` desde `war.publishAt` antes que `war.createdAt` (igual con
`expiresAt`←`eventEndAt` y `closesAt`←`signupCloseAt`) y devuelve esos alias en el objeto
normalizado. Como casi todo el código normaliza dos veces (`loadWars()` → mutación →
`updateWar()`), cualquier cambio a los campos canónicos se revierte en silencio:

- Republicación semanal (`schedulerService.js:331,379`): con el ciclo de la semana 2 aplicado,
  lo persistido vuelve a `createdAt/closesAt/expiresAt` de la semana 1 (reproducido).
- Modales de cierre/fin y de horario del panel (`eventAdminModalActions.js:238,356`): "actualizado"
  pero no cambia nada.
- `scheduledPublishAt` toma `publishAt` (= `createdAt`): los 2 tests de autopublicación fallan y un
  borrador web puede publicarse antes de tiempo (`route.ts:289-291` del PATCH).
- Además `dayOfWeek: null` se convierte en `0` (domingo) por `Number(null)` (D-5, ✅ ejecutado).

### D-2 · `saveWars` borra toda la base (= S-1, C-1, A-1 parcial)
🔍 leído. `src/db/warRepository.js:443-461,518-524`; llamadores `src/commands/event/eventAdmin.js:39`,
`src/services/recurrenceSeriesService.js:203,234`

`replaceAllWarsInSqlite` ejecuta `deleteMany()` sin filtro sobre todas las tablas de eventos y
reinserta solo la caché del bot. `event.deleteMany()` borra en cascada `EventOption` y
`EventEnrollment` (`schema.prisma:73,89-90`) y el repositorio **nunca** los recrea. Resultado:
se pierden todos los slots e inscripciones PvE de todos los servidores, los eventos creados desde
el dashboard, y reaparecen borradores ya eliminados. `/event schedule cancel` además no exige
permisos de admin (C-1, 🔍).

### D-3 · La caché del bot nunca se entera de lo que escribe el dashboard (= S-2, H-2, A-1)
🔍 leído. `warRepository.js:500-516,537-584`; `buttonHandler.js:98`; `app/api/.../publish/route.ts`

`warsCache` se carga al arrancar y solo se refresca con `loadWarsFresh` (autocomplete de
`/event schedule`). Un evento publicado desde la web responde "No se encontro el evento" a todos los
botones hasta reiniciar el bot, y cualquier clic sobre un evento editado en la web reescribe el
evento completo desde la copia vieja, revirtiendo la edición.

### C-2 · `America/Bogota` rechazada como zona inválida desde el segundo uso
✅ ejecutado. `src/utils/cronHelper.js:110-114`; `src/handlers/modalHandler.js:130-136`

En un acierto de caché devuelve `source: 'fallback'` si la zona coincide con la de por defecto. El
modal de creación rechaza todo `fallback` con texto no vacío, y además reemplaza un campo vacío por
`'America/Bogota'`. La primera llamada devuelve `alias`, la segunda `fallback`.

### H-5 · Títulos de modal de más de 45 caracteres
✅ ejecutado (`ModalBuilder.setTitle` lanza `ExpectedConstraintError` con 54 caracteres).
`interactionHandler.js:142,342`; `rolePanelActions.js:113,135,357`; `eventAdminPanelActions.js`
(10 sitios); `pveEventAdminPanelActions.js:174,207,371,387`. También `setValue` por encima de
`maxLength` (nombre de rol 60 vs 50, slots > 999 vs 3 dígitos).

## 4. Hallazgos por área

Leyenda de severidad: **C** crítico · **A** alto · **M** medio · **B** bajo. La columna *Fase*
remite a `ACTION_PLAN.md` (— = decisión de producto o diferido, ver §5 y §7).

### 4.1 Bot — datos, scheduler y ciclo de vida

| ID | Sev | Hallazgo | Verif. | Fase |
|----|-----|----------|--------|------|
| D-1 | C | Alias del ciclo de vida revierten horas; `publishAt` pisa `scheduledPublishAt`; `dayOfWeek:null`→0 | ✅ | 1 |
| D-2 | C | `saveWars` reemplaza toda la base (PvE de todos los guilds, eventos web) | 🔍 | 1 |
| D-3 | C | Caché del bot no se invalida con escrituras del dashboard | 🔍 | 4 |
| D-4 | A | Scheduler persiste snapshots (pierde inscripciones de último minuto); ticks pueden solaparse; `loadWarsFresh` sin lock | 🔍 | 1, 4 |
| D-6 | A | `updateEventDiscordMessage` renderiza la caché y no el evento recibido: tras el cierre automático el mensaje sigue "Abiertas" | ◻ | 1 |
| D-7 | A | La recurrencia exige el minuto exacto (`shouldExecute`); un minuto perdido = semana perdida; un error en autopublicación aborta el tick; borra el mensaje viejo y resetea PvE antes de publicar | 🔍 | 1 |
| D-8 | A | `db:import-json` con el JSON ausente o inválido vacía la base (= A-3); el export omite PvE y plantillas | 🔍 | 1 |
| D-9 | M | `createdAt` significa cosas distintas en bot y dashboard; el bot reescribe `duration` | ◻ | — |
| D-10 | M | Ciclos que cruzan medianoche quedan con cierre antes de la publicación | ◻ | 1 |
| D-11 | M | Autopublicación: sin aislamiento por candidato; un fallo en el `catch` corta el ciclo | ◻ | 1 |
| D-12 | M | `publishOrRefresh` republica ante cualquier fallo de edición (deja el mensaje viejo huérfano) | ◻ | 1 |
| D-13 | M | SQLite sin WAL con dos procesos escribiendo (= A-2, S-11) | 🔍 | 1 |
| D-14 | M | `joinedAt` se reinicia en cada reescritura y no hay `orderBy`: se pierde el orden de inscripción | ◻ | 4 |
| D-15 | M | Cada lectura clona y normaliza todos los eventos (= H-16, C-23) | 🔍 | 4 |
| D-16 | B | Falta índice `guildId(+eventType)`; índices redundantes | ◻ | 4 |
| D-17 | B | El apagado no detiene el scheduler ni el cliente (= C-18) | 🔍 | 1 |
| D-18 | B | Operaciones multi-paso sin atomicidad (crear evento + slots PvE) | ◻ | — |
| D-19 | B | Garmoth: borrado total por usuario bajo lock global; fetch sin endurecer (= C-13) | ◻ | 2 |
| D-20 | B | `toDate` convierte valores inválidos en "ahora" sin avisar | ◻ | — |
| D-21 | B | `withDbLog` duplica logs y rompe spies | ◻ | — |

### 4.2 Bot — handlers de interacciones

| ID | Sev | Hallazgo | Verif. | Fase |
|----|-----|----------|--------|------|
| H-1 | C | Ediciones de cierre/fin/horario del panel no se guardan (causa: D-1) | ✅ | 1 |
| H-3 | A | El panel admin guarda una copia vieja del evento completo: borra inscripciones concurrentes | 🔍 | 4 |
| H-4 | A | El contexto del panel no se limpia con `null`: "Eliminar" puede borrar el rol de otro evento | 🔍 | 2 |
| H-5 | A | Títulos de modal > 45 caracteres y `setValue` > `maxLength` | ✅ | 2 |
| H-6 | A | Trabajo lento (REST, publicación de series) antes de responder: supera los 3 s | ◻ | 2 (parcial) |
| H-7 | A | Cualquier miembro crea eventos programados que mencionan cualquier rol (= C-5) | 🔍 | — (decisión) |
| H-8 | A | Si falla el refresco del mensaje, el usuario inscrito ve "Error interno" y no se notifican promociones | ◻ | 2 |
| H-9 | M | Sin límite de roles (> 20 roles = 6 filas de botones, Discord rechaza el mensaje) ni de nombres duplicados (= C-4) | ◻ | 2 |
| H-10 | M | Re-clic en la waitlist manda al final de la cola (`waitlist_exists` inalcanzable) | ◻ | 2 |
| H-11 | M | Subir slots no promueve a la waitlist; borrar un rol deja waitlist huérfana (= C-15 parcial) | ◻ | 2 |
| H-12 | M | Doble clic une y saca al usuario | ◻ | — (decisión) |
| H-13 | M | Reabrir tras `closesAt` se revierte solo; se aceptan inscripciones entre `closesAt` y el tick | ◻ | 2 |
| H-14 | M | "Apagar" borra el evento sin confirmación | ◻ | — (decisión) |
| H-15 | M | Permisos de admin solo al entrar al panel; el contexto no expira (= C-9) | 🔍 | 2 |
| H-17 | M | Ediciones de serie validan dentro del bucle: serie a medio actualizar | ◻ | 2 |
| H-18 | B | Un borrador nuevo hereda menciones y días del borrador abandonado | ◻ | 2 |
| H-19 | B | `customId` desconocido nunca se responde | ◻ | 2 |
| H-20 | B | Selector de menciones limitado a 25 roles; regla de recap distinta entre flujos | ◻ | — |

### 4.3 Bot — comandos, utilidades y arranque

| ID | Sev | Hallazgo | Verif. | Fase |
|----|-----|----------|--------|------|
| C-1 | C | `/event schedule cancel` sin permisos + reemplazo total (ver D-2) | 🔍 | 1 |
| C-2 | A | Zona por defecto rechazada desde el segundo uso | ✅ | 2 |
| C-3 | A | `/fakeuser` (herramienta de test) registrado en producción sin permisos | 🔍 | 2 |
| C-5 | A | `/event create` y `/createwar` abiertos a cualquier miembro (= H-7) | 🔍 | — (decisión) |
| C-6 | A | `parseEmojiInput` acepta cualquier texto que contenga un emoji: rompe los botones | ◻ | 2 |
| C-7 | M | Un error tras `deferReply` deja la interacción "pensando…" | ◻ | 2 |
| C-8 | M | `/eventadmin role_* / lock / unlock / recap`: lectura-modificación-escritura no atómica | ◻ | 4 |
| C-10 | B | Hora "24" a medianoche con `hour12:false` | ✖ (Node 24 da "00") | 2 (endurecer) |
| C-11 | M | `truncate()` de `eventAdminUi` devuelve `max+2` caracteres: selects > 100 lanzan | 🔍 | 2 |
| C-12 | M | `isAdminExecutor` concede admin a cualquier rol **llamado** "admin"/"administrador" | 🔍 | — (decisión) |
| C-13 | M | Garmoth: `redirect:'follow'`, cuerpo sin límite, sin rate limit, pisa datos con `null` si el parseo falla | ◻ | 2 |
| C-14 | M | Listados > 2000 caracteres sin truncar (`/event schedule view`, plantillas) | ◻ | 2 |
| C-15 | M | `/eventadmin`: `role_slots` no promueve waitlist; `unlock` se revierte; recap "0 desactiva" falso | ◻ | 2 |
| C-16 | M | `register-commands`: un comando que falla al cargar se **borra** del servidor | ◻ | 2 |
| C-17 | M | Intents innecesarios (incluido `MessageContent`, privilegiado); sin `allowedMentions` por defecto | ◻ | — (decisión) |
| C-19 | M | Parser de Garmoth frágil y sin tests | ◻ | — |
| C-20 | B | Nombres de usuario sin `escapeMarkdown` (links enmascarados en embeds públicos) | ◻ | — (decisión) |
| C-21 | B | `notifyPromotion` permite pings a cualquier `<@id>` del contenido | ◻ | 2 |
| C-22 | B | `/editrole` por índice obsoleto; sin control de duplicados | ◻ | — |
| C-24 | B | Estado global sin TTL; borradores indexados solo por usuario | ◻ | 2 (parcial) |

### 4.4 Dashboard — API, autenticación y servidor

Matriz real de autorización: todas las rutas mutantes exigen sesión, acceso al guild y
`manageable` (calculado en servidor desde Discord), y filtran por el `guildId` de la URL. No hay IDOR
clásico entre guilds. `requireGuildAdmin` (`lib/apiGuards.ts`) es código muerto y el README describe
un modelo que ya no es el real.

| ID | Sev | Hallazgo | Verif. | Fase |
|----|-----|----------|--------|------|
| S-3 | A | PATCH de evento acepta `messageId`/`channelId` arbitrarios; el adaptador REST no valida snowflakes (= U-8) | 🔍 | 3 |
| S-4 | A | Cookie `spectre_verified_guilds` sin `userId`, prioritaria sobre Discord, renovable sin reverificar, no se borra al salir; secreto de respaldo fijo `"spectre-dashboard-dev-secret"`; comparación no constante | 🔍 | 3 |
| S-5 | A | Detalle de evento: una llamada REST por participante, sin caché (riesgo de 429 compartido con el bot) | ◻ | 3 |
| S-6 | M | El access token de Discord se expone al navegador y no se refresca | ◻ | — (decisión) |
| S-7 | M | Sesiones de Google pasan los guards pensados para Discord | ◻ | 3 |
| S-8 | M | Mensajes de error de Prisma devueltos al cliente | ◻ | 3 |
| S-9 | M | Validación inconsistente (solo 2 rutas con zod; `reorder` sin límites; body `null` → 500) | ◻ | 3 (parcial) |
| S-10 | M | PATCH de slot de plantilla con `allowedRoleIds` → 500 | ◻ | 3 |
| S-12 | M | Publicar no comprueba `isClosed`; llamadas REST duplicadas; sin try/catch | ◻ | 3 |
| S-13 | M | `fetchBotGuildIds` sin paginación (> 200 servidores) ni caché global | ◻ | 3 |
| S-14 | M | Resumen y listados cargan relaciones completas solo para contar | ◻ | 3 |
| S-15 | M | Dominio duplicado y divergente: zona por defecto Santiago (web) vs Bogotá (bot) (= A-5, U-14) | 🔍 | — (decisión) |
| S-16 | B | CSRF depende solo de `SameSite=Lax` | ◻ | — (depende del despliegue) |
| S-17 | B | Modo preview sin sesión ejecuta consultas y llamadas al bot | ◻ | — |
| S-18 | B | Canales privados y perfiles Garmoth visibles para miembros no admin | ◻ | — (decisión) |
| S-19 | B | Higiene: `server-only` faltante, 5 copias de `getBotToken` | ◻ | 5 |
| S-20 | B | Listado ordenado `closesAt asc` + `take:100` oculta los eventos recientes (= U-22) | ◻ | 3 |

### 4.5 Dashboard — UI

| ID | Sev | Hallazgo | Verif. | Fase |
|----|-----|----------|--------|------|
| U-1 | A | `pattern="\\d{1,2}:\\d{2}"` impide guardar cualquier plantilla con hora | 🔍 | 3 |
| U-2 | A | Borradores de roles por slot nunca se limpian: una edición posterior reenvía roles viejos | ◻ | 3 |
| U-3 | A | Zona horaria inválida se reemplaza en silencio por America/Santiago | ◻ | 3 |
| U-4 | A | Sin `error.tsx`, `not-found.tsx`, `loading.tsx` | 🔍 | 3 |
| U-5 | M | Doble creación de borrador mientras navega | ◻ | 3 |
| U-6 | M | Validación del asistente opaca; "Add time option" repite la hora | ◻ | 3 (parcial) |
| U-7 | M | Cerrar/reabrir inscripciones no refresca la UI | ◻ | 3 |
| U-9 | M | Posiciones de slot base 0 vs 1 inconsistentes | ◻ | — |
| U-10..13 | M | Accesibilidad: diálogos sin foco/Esc, selectores sin teclado, sin regiones vivas, drag & drop | ◻ | — |
| U-15 | M | La ficha de evento descarga todo `NewEventForm` (import cruzado de `RoleMultiSelect`) | ◻ | 3 |
| U-16 | M | Componentes monolíticos (`NewEventForm` 1.088 líneas) | — | — |
| U-17/18 | M | Textos que contradicen el producto y placeholders presentados como reales | ◻ | — (decisión) |
| U-19 | M | El modo preview se pierde al primer clic | ◻ | — |
| U-20/21 | M | Sidebar sin versión móvil; boilerplate repetido en 15 páginas | ◻ | — |
| U-24 | B | Animación `spectreFadeUp` rota (keyframes global usado desde CSS Modules) | ◻ | 3 |
| U-25 | B | Imágenes pesadas (favicon 434 KB, fondos de 1,7–2,4 MB) | ◻ | — |
| U-26 | B | CSS duplicado; 448 colores literales | ◻ | — |

### 4.6 Arquitectura, tests, tooling

| ID | Sev | Hallazgo | Verif. | Fase |
|----|-----|----------|--------|------|
| A-4 | A | Sin CI, lint ni typecheck; `next lint` roto (no hay ESLint) | 🔍 | 5 |
| A-6 | A | Puente `createRequire('../../../../src/...')`; `main: index.js` inexistente | 🔍 | — |
| A-7 | M | Harness de tests serial, migraciones con split de SQL frágil | ◻ | — |
| A-8 | M | Vitest sin alias `@`; mocks de identidad | ◻ | 5 |
| A-9/10 | M | Capas cruzadas (`warState` → servicios); `eventadminShared` dentro de `commands/`; loaders duplicados | 🔍 | — |
| A-11 | M | 7 claves `global.*` sin TTL | 🔍 | — |
| A-13 | M | Entorno sin validar; `.env.example` incompleto; no hay `.env.example` del dashboard | ◻ | 5 |
| A-14 | M | Dependencias: `node-cron` sin uso; dashboard usa `@prisma/client` y `server-only` sin declararlos; sin `engines`; licencia ISC vs MIT | 🔍 | 5 |
| A-15 | M | Sin backups de SQLite ni guía de despliegue | ◻ | 5 |
| A-16 | M | Cobertura engañosa (sin `coverage.include`); tests débiles | 🔍 | 5 |
| A-18 | B | `data/garmoth-links.json` versionado con IDs reales de Discord en un repo público | 🔍 | — (decisión) |
| A-20 | B | Código muerto: `timezoneHelper.js`, funciones de `cronHelper`, `requireGuildAdmin` | 🔍 | 5 |
| A-22 | B | Documentación desactualizada (estructura, API del dashboard) | 🔍 | 5 |
| A-23 | B | `.gitignore` sin `*.db` genéricos | ◻ | 5 |

## 5. Decisiones de producto pendientes (no se implementan sin tu visto bueno)

Estos puntos cambian reglas del producto o requieren información que no está en el repo:

1. **Quién puede crear eventos** (C-5/H-7): hoy cualquier miembro puede crear y programar eventos que
   mencionan roles. ¿Solo admins, un rol organizador configurable, o se mantiene abierto?
2. **Admin por nombre de rol** (C-12): cualquier rol llamado "admin" da permisos de bot-admin.
   Alternativa: IDs de rol configurables y/o permiso `ManageGuild`.
3. **`/fakeuser` en producción** (C-3): en la fase 2 queda restringido a administradores; ¿quieres
   además excluirlo del registro salvo con una variable `ENABLE_TEST_COMMANDS`?
4. **Semántica de botones** (H-12, H-14): doble clic une y saca; "Apagar" borra el evento sin
   confirmar. ¿Confirmación o apagado suave?
5. **Datos reales versionados** (A-18): `data/garmoth-links.json` contiene IDs reales. Sacarlo del
   repo es fácil; borrarlo del historial requiere reescribir la historia de GitHub.
6. **Token OAuth en el navegador** (S-6): moverlo solo al servidor y añadir refresh requiere probar el
   login real con Discord, que no puedo hacer sin credenciales.
7. **CSRF por `Origin`** (S-16): depende de cómo se despliega (proxy, dominio).
8. **Zona horaria por defecto** (S-15/U-14): el bot usa America/Bogota y el dashboard America/Santiago.
   ¿Cuál es la correcta para tu comunidad?
9. **Intents** (C-17): quitar `MessageContent`/`GuildMessages`/`DirectMessages` es seguro según el
   código, pero conviene confirmarlo contra el Developer Portal.
10. **Textos y placeholders del dashboard** (U-17/U-18): login con email/contraseña inoperante,
    contadores fijos en 0, textos que dicen que la edición web "no está habilitada".
11. **Escapar markdown en nombres** (C-20): cambia cómo se ven nombres con `_` o `*`.
12. **`/event schedule view`**: hoy cualquier miembro ve las programaciones del canal. `schedule
    cancel` pasa a exigir admin (es destructivo); ¿la vista también?
13. **Publicación tardía si el bot se perdió el minuto exacto** (D-7, ítem 1.5 diferido): hoy una
    ocurrencia semanal solo se publica en el minuto `HH:mm` exacto. Opciones: (a) mantenerlo así;
    (b) publicar con retraso dentro de la ventana hasta el cierre, relajando la regla para eventos que
    nunca se publicaron; (c) lo anterior y ajustar los tests que crean el evento en el mismo minuto.

14. **Eventos con cierre = fin** (NEW-2): con "Close before end" en 0 (el valor por defecto), el cierre
    coincide con el fin y el cálculo del ciclo interpreta el fin como del día siguiente, así que el
    mensaje se borra 24 h después del cierre. ¿Debe ser válido cerrar justo al terminar (y entonces
    terminar ese mismo día), o hay que exigir un margen mínimo? Hoy `validateFutureLifecycle` lo
    rechaza para `/event publish`.

15. **Borradores semanales creados en la web**: el dashboard los guarda como "serie recurrente
    habilitada" con `time` = hora de **inicio** del evento. El bot los publica solo a esa hora (también
    ocurría antes, tras cada reinicio del bot). ¿Deben publicarse automáticamente, y a qué hora (inicio
    o una hora de publicación propia)? Mientras tanto, el bot ya no puede borrar una publicación viva
    del mismo día (hallazgo H1 de la revisión final).

### Hallazgos nuevos durante la implementación

- **NEW-1 [Alto]** · Los eventos creados con `/event create` se publican con cierre y fin a la hora del
  día en que se crearon (no a la del evento). 🔍 leído. `modalHandler.js:183`,
  `scheduleFlow.js:324-325`, `schedulerService.js` (`executeWarPublication`). Fase 4, ítem 4.0.
- **Tests dependientes de la hora** · 5 tests solo pasan de ~19:00 a ~01:00 (Chile). Ítem 1.12.
- **NEW-2 [Medio]** · Cierre = fin hace que el fin se calcule al día siguiente (desde `76d7fe3`).
  Verificado por `bot-core` con un script. Decisión pendiente (§5, punto 14).
- **Escrituras del dashboard en tablas hijas** · No actualizan `Event.updatedAt`, por lo que el bot
  (que desde la fase 4 sincroniza por `updatedAt`) no las ve. Ítem 4.6.

## 6. Arquitectura

### Estado actual

- **Bien**: `src/db` es la única capa que usa Prisma; no hay ciclos de `require`; el dashboard filtra
  todo por guild y calcula permisos en servidor.
- **Mal**: el bot usa una caché síncrona en memoria como fuente de verdad mientras otro proceso
  (Next.js) escribe la misma SQLite; el agregado "evento" se persiste borrando y recreando hijos; PvE
  (`EventOption`/`EventEnrollment`) vive fuera del agregado y fuera de los locks; el dominio
  (normalización, zonas, ciclo de vida) está duplicado en el dashboard con defaults distintos.
- **Archivos monolíticos**: `eventAdminPanelActions.js` 1.635 líneas (~55 handlers),
  `dashboardData.ts` 1.377, `NewEventForm.tsx` 1.088, `rolePanelActions.js` 1.015.

### Estructura objetivo (incremental, sin mover lo que no aporta)

```
src/
  bootstrap/   config (validación de entorno), loadCommands compartido, router de interacciones
  commands/    solo comandos (data + execute); helpers en commands/shared/
  handlers/    igual (partir los monolitos solo con tests de caracterización previos)
  services/    igual
  db/          igual + pragmas SQLite + lectura puntual por evento
  domain/      puro: warState, eventLifecycleTimes, zonas horarias (con shims en utils/)
  utils/       lo que quede (logger, respuesta de interacciones, límites de Discord)
apps/dashboard/lib/server/  repositorios por agregado + casos de uso (publish/sync/unpublish)
```

**Qué no se mueve y por qué**: `prisma/` (el cliente generado y `DATABASE_URL` relativa dependen de
la ruta), los comandos de primer nivel (los loaders solo leen ese nivel), `handlers/services/db`
(la separación ya se respeta; moverlos es solo diff). Partir los monolitos de 1.000–1.600 líneas con
12 % de cobertura de ramas no es seguro sin tests de caracterización: queda fuera de esta pasada
(ver `ACTION_PLAN.md` §7).

## 7. Registro de verificación

Las reproducciones ejecutadas están en el historial de la sesión; cada corrección del plan añade
además un test de regresión que falla antes del cambio y pasa después.
