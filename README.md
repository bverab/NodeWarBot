# NodeWarBot

Bot de Discord para gestionar eventos tipo Node War (Black Desert Online), con flujo interactivo de creacion, publicacion programada, inscripcion por roles y herramientas de administracion.

## Estado actual (resumen)

- Estable:
  - Creacion y publicacion de eventos (`/event create`, alias `/createwar`)
  - Eventos unicos y recurrentes (scheduler por dias)
  - Inscripcion por botones con waitlist y promociones
  - Edicion contextual de eventos publicados (`/event edit`)
  - Integracion Garmoth (`link`, `view`, `unlink`, `refresh`)
  - Render enriquecido de participantes con datos Garmoth (cuando existen)
- En evolucion:
  - UX del editor avanzado (iteraciones frecuentes en paneles)
  - Configuracion visual por evento (fuente de iconos/estilo)
- Persistencia:
  - Archivos JSON locales en `data/` (sin base de datos)

## Funcionalidades principales

### 1) Creacion y programacion de eventos

- `/event create tipo:war|siege` abre modal de creacion.
- Alias legacy: `/createwar` (equivale a crear evento tipo war).
- Soporta:
  - nombre, descripcion, timezone, hora de publicacion
  - duracion y cierre de inscripcion antes del inicio (`duracion` o `duracion/cierreAntes`)
- Flujo schedule:
  - seleccion de modo y dias
  - publicacion automatica por scheduler
  - cancelacion de programaciones (`/event schedule cancel`)

### 2) Inscripciones, roles y waitlist

- Inscripcion por botones en mensaje del evento.
- Un usuario no queda en dos roles del mismo evento.
- Waitlist por rol con promocion automatica al liberarse un slot.
- Soporte de restricciones por rol de Discord (permisos por rol del evento).

### 3) Edicion contextual de eventos publicados

- `/event edit` abre selector de eventos del canal y panel administrativo contextual.
- Edicion de roles en flujo (nombre, slots, permisos, icono, eliminar).
- Edicion de datos del evento y horario.
- Publicar/actualizar mensaje del evento desde el panel.
- Configuracion de menciones para publicacion.

### 4) Iconos de rol y visual

- Fuente de iconos configurable por evento: `bot` o `guild`.
- Fuente `bot`:
  - usa application emojis de la app del bot
  - selector UI con emojis disponibles (sin limitarse solo a clases BDO)
- Fuente `guild`:
  - usa emojis del servidor actual
- Fallback manual:
  - escribir icono manualmente
  - limpiar icono

### 5) Render enriquecido de participantes

Cuando hay datos Garmoth validos para el usuario inscrito, el listado muestra linea enriquecida con:

- nickname de Discord (siempre como nombre principal)
- icono de clase (segun fuente configurada)
- gear score (si existe)
- spec corta (`A` Awakening / `S` Succession, si existe)

Si no hay datos o faltan campos, aplica fallback limpio sin romper el render.

### 6) Integracion Garmoth

Comando: `/garmoth`

- `link <url>`: vincula perfil y ejecuta auto-refresh inmediato
- `view`: muestra datos vinculados
- `unlink`: desvincula perfil
- `refresh`: sincronizacion manual

Datos extraidos/parceados actualmente:

- `characterName`
- `className`
- `spec`
- `gearScore`

Notas:

- El parser intenta rutas semanticas y fallback de estructura HTML/estado embebido.
- Si no hay confianza suficiente, el sistema marca parcial/fail y evita datos basura.

### 7) Herramientas admin adicionales

- `/eventadmin add/remove`: gestionar inscritos reales en evento publicado
- `/eventadmin lock/unlock`: bloquear o abrir inscripciones por ID
- `/eventadmin role_*`: operaciones administrativas sobre roles del evento
- `/eventadmin recap`: configuracion de hilo final

## Comandos disponibles

- `/event create`
- `/event edit`
- `/event schedule view`
- `/event schedule cancel`
- `/createwar` (alias legacy)
- `/editrole` (edicion de roles en draft)
- `/eventadmin ...`
- `/garmoth ...`
- `/fakeuser` (pruebas)
- `/ping`

## Instalacion

```bash
git clone <tu-repo>
cd NodeWarBot
npm install
```

## Variables de entorno

Crear `.env` en la raiz:

```env
TOKEN=tu_token_discord
CLIENT_ID=tu_client_id
GUILD_ID=123456789012345678,987654321098765432
```

Notas:

- `GUILD_ID` acepta uno o varios IDs separados por coma.
- `register-commands` ignora IDs invalidos y reporta resumen.

## Registrar comandos

```bash
node src/register-commands.js
```

## Ejecutar bot

```bash
node src/index.js
```

Tambien disponible:

```bash
npm run register
npm start
```

## Estructura resumida

- `src/commands/`: slash commands
- `src/handlers/`: handlers de interacciones, botones y modales
- `src/services/`: persistencia, scheduler, integraciones (Garmoth, etc.)
- `src/utils/`: builders, formatters, resolvers y helpers
- `data/`: almacenamiento JSON (`wars.json`, links Garmoth, etc.)

## Configuracion opcional de iconos de clase por servidor

Existe soporte para mapping explicito por servidor en:

- `data/server-class-emojis.json`

Si no existe mapping o no hay emoji resoluble, el render hace fallback limpio.

## Limitaciones actuales

- Persistencia local JSON (sin DB transaccional ni locking distribuido).
- No hay suite de tests automatizados aun.
- Parte de la UX del editor sigue en iteracion (aunque funcional en produccion).
- Tipo `10v10` aparece como placeholder/roadmap en creacion, no como flujo completo.

## Siguientes mejoras razonables (corto)

- Migrar persistencia a DB.
- Agregar tests de integracion para flujos criticos (`/event edit`, scheduler, garmoth refresh).
- Endurecer observabilidad (logs estructurados y metricas de errores de scraping).
