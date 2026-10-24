const { MAX_ROLES, MIN_ROLE_SLOTS, MAX_ROLE_SLOTS } = require('../constants/eventLimits');

function roleNameKey(name) {
  return String(name ?? '').trim().toLowerCase();
}

function isValidRoleSlots(value) {
  return Number.isInteger(value) && value >= MIN_ROLE_SLOTS && value <= MAX_ROLE_SLOTS;
}

// ¿Ya hay otro rol con ese nombre (sin distinguir mayusculas)? `ignoreIndex` excluye al rol que se renombra.
function hasDuplicateRoleName(roles, name, ignoreIndex = -1) {
  const key = roleNameKey(name);
  return (Array.isArray(roles) ? roles : []).some((role, index) => index !== ignoreIndex && roleNameKey(role?.name) === key);
}

// Valida un lote de roles nuevos contra los existentes. Solo se usa en las entradas:
// los eventos ya guardados no se revalidan.
function validateNewRoles(existingRoles, newRoles) {
  const existing = Array.isArray(existingRoles) ? existingRoles : [];
  const incoming = Array.isArray(newRoles) ? newRoles : [];

  if (existing.length + incoming.length > MAX_ROLES) {
    return {
      ok: false,
      message: `Un evento admite como maximo ${MAX_ROLES} roles (hay ${existing.length} y quieres agregar ${incoming.length}).`
    };
  }

  const seen = new Set(existing.map(role => roleNameKey(role?.name)));
  for (const role of incoming) {
    if (!isValidRoleSlots(role.max)) {
      return {
        ok: false,
        message: `Slots invalidos para **${role.name}**. Deben estar entre ${MIN_ROLE_SLOTS} y ${MAX_ROLE_SLOTS}.`
      };
    }

    const key = roleNameKey(role.name);
    if (seen.has(key)) {
      return { ok: false, message: `Ya existe un rol llamado **${role.name}**.` };
    }
    seen.add(key);
  }

  return { ok: true, message: null };
}

module.exports = {
  isValidRoleSlots,
  hasDuplicateRoleName,
  validateNewRoles
};
