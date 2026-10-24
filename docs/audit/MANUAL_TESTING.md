# Guía de pruebas manuales

Los 576+ tests automáticos cubren la lógica, pero no pueden hablar con Discord ni con el login OAuth
real. Esta guía reúne lo que hay que comprobar a mano después de desplegar la rama
`chore/pnpm-and-audit`. Cada punto indica el ítem o hallazgo de [`AUDIT.md`](AUDIT.md) que verifica.

## 0. Preparación

1. Un **servidor de Discord de pruebas** con el bot invitado (scopes `bot` y `applications.commands`)
   y dos cuentas: una **admin** (permiso Administrator) y una **miembro** sin permisos.
2. `.env` en la raíz (plantilla: `.env.example`) y `apps/dashboard/.env.local` (plantilla:
   `apps/dashboard/.env.example`) con un `NEXTAUTH_SECRET` propio.
3. Si vas a usar una base con datos reales: **trabaja sobre una copia** y ejecuta `pnpm db:backup`.
4. Instalación y arranque:

   ```bash
   pnpm install --frozen-lockfile
   pnpm db:generate
   pnpm db:migrate:deploy
   pnpm register
   pnpm start
   pnpm dashboard:dev        # en otra terminal
   ```

5. Opcional, solo si la base viene de antes de esta rama: `pnpm db:repair-lifecycle` (modo de prueba)
   para ver qué series recurrentes tienen las horas de cierre/fin dañadas por NEW-1; revisa la lista y
   luego ejecútalo con `--apply`.

## 1. Arranque y apagado

- [ ] Sin `TOKEN` en `.env`, `pnpm start` termina con un mensaje claro que nombra la variable (1.9).
- [ ] Con todo configurado, el bot arranca y registra la ruta de SQLite. Junto a la base aparecen
      `*.db-wal` y `*.db-shm` (modo WAL, 1.10).
- [ ] `Ctrl+C`: en el log aparecen "Scheduler detenido", "Persistencia cerrada" y "Bot detenido" (1.9).

## 2. Crear eventos desde Discord

- [ ] `/event create` con la zona horaria **por defecto** (o vacía) **tres veces seguidas**: ninguna
      responde "Zona horaria invalida" (C-2).
- [ ] Un evento con nombre largo (≈ 90 caracteres): se pueden abrir **todos** los modales del borrador y
      del panel (horarios PvE, hilo final, editar datos, roles) sin "This interaction failed" (H-5).
- [ ] Crear un evento a una hora (p. ej. 15:30) para publicarse a otra (22:00) con duración 70 y cierre
      10: se publica a las 22:00 y **sigue abierto a las 22:01** (NEW-1).
- [ ] Empezar un borrador, abandonarlo, crear otro: el nuevo **no** hereda las menciones ni los días del
      anterior (H-18).
- [ ] Intentar 21 roles o dos roles con el mismo nombre (distinta capitalización): rechazo con mensaje
      claro (H-9). Un icono con texto extra (`hola ✅`) se rechaza; `✅`, `❤️`, `🇨🇱`, `1️⃣` se aceptan
      (C-6, H8).

## 3. Inscripciones (cuenta miembro)

- [ ] Unirse y salir de un rol; el mensaje se actualiza.
- [ ] Rol lleno: entrar a la waitlist; **volver a hacer clic** no te manda al final de la cola (H-10).
- [ ] Después de la hora de cierre y antes del siguiente minuto: no se puede **entrar**, pero sí
      **salir** (War: H-13; PvE: 1.11).
- [ ] Con el bot sin permiso para editar el mensaje: al unirse igual responde "Te uniste" (no "Error
      interno") (H-8).
- [ ] El orden de inscritos se conserva después de reiniciar el bot (D-14).

## 4. Panel de administración (`/event edit`)

- [ ] Con la cuenta **miembro**, pulsar botones de un panel que abrió un admin: responde "Solo Admin…"
      (H-15). Un panel inactivo más de 30 min pide volver a abrirlo (C-9).
- [ ] Seleccionar el rol 3 del evento A, abrir el evento B y pulsar "Eliminar": pide seleccionar un rol,
      **no** borra nada de B (H-4).
- [ ] Cambiar el cierre y el fin desde el modal: el cambio **persiste** (H-1/D-1).
- [ ] Subir los slots de un rol con gente en waitlist: los primeros pasan al rol y reciben aviso (H-11).
- [ ] Editar el panel mientras otra cuenta se inscribe: no se pierde ninguna inscripción (4.3).
- [ ] Publicar una serie o cambiar iconos con la red lenta: el panel se actualiza sin "interacción
      fallida" (2.22).
- [ ] Un `customId` viejo (botón de un panel muy antiguo) responde "Accion no disponible" (H-19).

## 5. Programaciones y series

- [ ] `/event schedule cancel` con la cuenta **miembro**: rechazado. Con **admin**: cancela solo ese
      evento; los eventos PvE (y sus inscritos) de **otros** eventos y servidores siguen intactos (D-2).
- [ ] Quitar y mover un día de una serie PvE: los horarios se copian y nada más cambia (1.2).
- [ ] Una serie recurrente real durante **dos semanas**: la semana 2 se publica con las horas correctas
      y no se cierra ni se borra enseguida (D-1).
- [ ] Un evento que cierra después de medianoche (publicación 23:30, cierre 00:15) funciona (1.7).
- [ ] Cierre automático: el mensaje pasa a "Cerradas" y los botones se deshabilitan (1.3).

## 6. Comandos de admin

- [ ] `/fakeuser` **no aparece** para la cuenta miembro (tras `pnpm register`) (C-3).
- [ ] `/eventadmin role_slots` sube slots y promueve la waitlist (C-15).
- [ ] Un comando que falla tras "pensando…" muestra un error en vez de quedarse cargando (C-7).
- [ ] `/garmoth link` y `refresh` con un perfil real; un segundo `refresh` antes de 60 s se rechaza por
      cooldown (C-13).

## 7. Dashboard

- [ ] Login con Discord funciona; una sesión que ya estaba abierta antes del despliegue también (3.3).
- [ ] Cerrar sesión con la cuenta A y entrar con la cuenta B en el mismo navegador: B **no** ve los
      servidores de A (S-4).
- [ ] Crear un evento: con una zona mal escrita (`America/Bogta`) muestra error y no deja crear (U-3).
      Doble clic en "Create draft" crea **un** solo borrador (U-5).
- [ ] Guardar una plantilla con hora `20:00` funciona (U-1).
- [ ] Editar los roles de un slot, cancelar y reabrir: no quedan cambios fantasma (U-2).
- [ ] Cerrar/reabrir inscripciones actualiza la página al instante (U-7).
- [ ] Publicar desde la web: los **botones funcionan de inmediato en Discord** y el bot cierra y borra el
      evento a su hora (4.2).
- [ ] Renombrar un slot en la web y luego inscribirse desde Discord: el nombre nuevo se mantiene, y el
      formulario de la web sigue funcionando sin errores 404 (4.6, H3).
- [ ] Publicar a mano una serie semanal creada en la web **el mismo día** de su hora de inicio: a esa
      hora el bot **no** borra ni republica el mensaje (H1).
- [ ] Publicar un evento cerrado o vencido responde 409 (S-12). Vincular un `messageId` de un mensaje
      que no es del bot responde 400 (S-3).
- [ ] Un evento que el bot ya expiró **no** aparece como borrador ni se puede borrar como tal (H5).
- [ ] Una URL inexistente muestra la página 404 de Spectre (U-4).

## 8. Operación

- [ ] `pnpm db:backup` crea una copia en `data/backups/` y conserva las 14 últimas.
- [ ] `pnpm db:import-json` sin `--force` sobre una base con datos se niega a importar (D-8).
- [ ] Primer push a GitHub: el workflow `CI` termina en verde (lint, tipos, tests y build).
