// Repara la hora de cierre y de fin de eventos recurrentes creados con /event create entre 76d7fe3 y
// la correccion NEW-1: quedaron con closesAt/expiresAt relativos a la hora de creacion.
//
// Uso: pnpm db:repair-lifecycle            (solo muestra lo que cambiaria)
//      pnpm db:repair-lifecycle --apply    (copia la base con VACUUM INTO y aplica)
//
// Objetivo: eventos con schedule.enabled, con hora y cuyo id no empieza por web_ (los del dashboard
// guardan sus propias horas), cuya hora local de cierre/fin no coincide con hora + duracion /
// closeBeforeMinutes. Se recalcula la proxima ocurrencia con las mismas utilidades que NEW-1.
// No se tocan: eventos con mensaje vigente (se reintenta cuando expiran) ni eventos cuya duracion
// guardada ya no es confiable (cierre o fin no posteriores a la publicacion guardada): esos se
// corrigen a mano desde el panel (Editar horario).
const path = require('path');
const {
  applyLifecycleToWar,
  deriveLifecycleFromDuration,
  formatTimeInEventZone
} = require('../src/utils/eventLifecycleTimes');

function parseArgs(argv = []) {
  const options = { apply: false };
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    throw new Error(`Argumento no reconocido: ${arg}. Usa --apply para escribir.`);
  }
  return options;
}

function planLifecycleRepair(war, nowMs) {
  if (!war.schedule?.enabled || !war.time || String(war.id).startsWith('web_')) return null;
  if (!Number.isInteger(war.dayOfWeek)) return null;

  const lifecycle = deriveLifecycleFromDuration({
    dayOfWeek: war.dayOfWeek,
    publishTime: war.time,
    durationMinutes: war.duration,
    closeBeforeMinutes: war.closeBeforeMinutes,
    timezone: war.timezone,
    now: new Date(nowMs)
  });
  if (!lifecycle) return null;

  const current = {
    close: formatTimeInEventZone(war.closesAt, war.timezone, '--:--'),
    end: formatTimeInEventZone(war.expiresAt, war.timezone, '--:--')
  };
  const expected = {
    close: formatTimeInEventZone(lifecycle.signupCloseAt.getTime(), war.timezone),
    end: formatTimeInEventZone(lifecycle.eventEndAt.getTime(), war.timezone)
  };
  if (current.close === expected.close && current.end === expected.end) return null;

  const isLive = Boolean(war.messageId) && Number.isFinite(war.expiresAt) && nowMs < war.expiresAt;
  const untrustedDuration = !(war.closesAt > war.createdAt && war.expiresAt > war.createdAt);
  return {
    id: war.id,
    name: war.name,
    timezone: war.timezone,
    time: war.time,
    current,
    expected,
    action: isLive ? 'live' : untrustedDuration ? 'manual' : 'repair',
    lifecycle
  };
}

async function planLifecycleRepairs({ now = new Date() } = {}) {
  const { readWarsFromSqlite } = require('../src/db/warRepository');
  const wars = await readWarsFromSqlite();
  return wars
    .map(war => planLifecycleRepair(war, now.getTime()))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function describePlan(plan) {
  const actions = {
    repair: 'se corrige',
    live: 'omitido: mensaje vigente, reintentar cuando expire',
    manual: 'omitido: duracion guardada no confiable, corregir con Editar horario'
  };
  return `${plan.id} | ${plan.name} | ${plan.timezone} | publica ${plan.time} | cierre ${plan.current.close} -> ${plan.expected.close}`
    + ` | fin ${plan.current.end} -> ${plan.expected.end} | ${actions[plan.action]}`;
}

async function runLifecycleRepair({ apply = false, backupDir, now = new Date(), log = () => {} } = {}) {
  const plans = await planLifecycleRepairs({ now });
  plans.forEach(plan => log(describePlan(plan)));

  const toRepair = plans.filter(plan => plan.action === 'repair');
  if (!apply || toRepair.length === 0) {
    return { plans, applied: [], backupPath: null };
  }

  const { prisma } = require('../src/db/client');
  const { createBackup } = require('./backup-db');
  const warService = require('../src/services/warService');
  const backup = await createBackup({ prisma, backupDir, keep: Number.MAX_SAFE_INTEGER, now });

  const applied = [];
  for (const plan of toRepair) {
    const { war } = await warService.updateWarById(plan.id, fresh => {
      // Se reevalua sobre la fila actual por si cambio desde el plan.
      if (!planLifecycleRepair(fresh, now.getTime())) return false;
      applyLifecycleToWar(fresh, plan.lifecycle);
    });
    if (war) applied.push(plan.id);
  }
  return { plans, applied, backupPath: backup.path };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no esta definida (ver .env.example).');
  }
  const { initializePersistence, shutdownPersistence } = require('../src/db/init');
  const { getDataDirPath } = require('../src/db/jsonStore');

  await initializePersistence();
  try {
    const result = await runLifecycleRepair({
      apply: options.apply,
      backupDir: path.join(getDataDirPath(), 'backups'),
      log: line => console.log(`[repair] ${line}`)
    });
    if (result.plans.length === 0) {
      console.log('[repair] No hay eventos con horas de cierre/fin para corregir.');
    } else if (!options.apply) {
      console.log(`[repair] ${result.plans.length} evento(s) listados. Nada se escribio: usa --apply para corregir los marcados "se corrige".`);
    } else {
      if (result.backupPath) console.log('[repair] Backup de la base creado en:', result.backupPath);
      console.log(`[repair] Corregidos: ${result.applied.length}.`);
    }
  } finally {
    await shutdownPersistence();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[repair] Error:', error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  planLifecycleRepair,
  planLifecycleRepairs,
  runLifecycleRepair
};
