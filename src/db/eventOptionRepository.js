const { prisma } = require('./client');

function normalizeOptionInput(option = {}, index = 0, defaultCapacity = 5) {
  const time = String(option.time || '').trim();
  const label = String(option.label || time).trim();
  const capacity = Number.isInteger(option.capacity) && option.capacity > 0
    ? option.capacity
    : defaultCapacity;

  if (!time) {
    throw new Error('Opcion invalida: time requerido.');
  }

  return {
    position: Number.isInteger(option.position) ? option.position : index,
    label: label || time,
    time,
    capacity
  };
}

async function replaceEventOptions(eventId, optionsInput = [], defaultCapacity = 5) {
  const eventIdValue = String(eventId);
  const options = optionsInput.map((option, index) => normalizeOptionInput(option, index, defaultCapacity));

  await prisma.$transaction(async tx => {
    await tx.eventEnrollment.deleteMany({ where: { eventId: eventIdValue } });
    await tx.eventOption.deleteMany({ where: { eventId: eventIdValue } });

    for (const option of options) {
      await tx.eventOption.create({
        data: {
          eventId: eventIdValue,
          position: option.position,
          label: option.label,
          time: option.time,
          capacity: option.capacity
        }
      });
    }
  });
}

async function listEventOptionsWithEnrollments(eventId) {
  const rows = await prisma.eventOption.findMany({
    where: { eventId: String(eventId) },
    include: {
      enrollments: {
        orderBy: { joinedAt: 'asc' }
      }
    },
    orderBy: [
      { position: 'asc' },
      { time: 'asc' }
    ]
  });

  return rows.map(row => ({
    id: row.id,
    eventId: row.eventId,
    position: row.position,
    label: row.label,
    time: row.time,
    capacity: row.capacity,
    enrollments: row.enrollments.map(enrollment => ({
      id: enrollment.id,
      eventId: enrollment.eventId,
      optionId: enrollment.optionId,
      userId: enrollment.userId,
      displayName: enrollment.displayName,
      isFake: Boolean(enrollment.isFake),
      enrollmentType: String(enrollment.enrollmentType || 'PRIMARY'),
      joinedAt: enrollment.joinedAt instanceof Date ? enrollment.joinedAt.getTime() : Date.now()
    }))
  }));
}

async function getEventOption(optionId) {
  if (!optionId) return null;
  return await prisma.eventOption.findUnique({
    where: { id: String(optionId) },
    include: {
      event: true,
      enrollments: {
        orderBy: { joinedAt: 'asc' }
      }
    }
  });
}

function normalizeEnrollmentType(value) {
  return String(value || 'PRIMARY').toUpperCase() === 'FILLER' ? 'FILLER' : 'PRIMARY';
}

async function joinEventOption({ eventId, optionId, userId, displayName, isFake = false, enrollmentType = 'PRIMARY' }) {
  const eventIdValue = String(eventId);
  const optionIdValue = String(optionId);
  const userIdValue = String(userId);
  const typeValue = normalizeEnrollmentType(enrollmentType);

  return await prisma.$transaction(async tx => {
    const event = await tx.event.findUnique({ where: { id: eventIdValue } });
    if (!event) return { ok: false, reason: 'event_missing' };
    if (event.isClosed) return { ok: false, reason: 'closed' };

    const option = await tx.eventOption.findUnique({ where: { id: optionIdValue } });
    if (!option || option.eventId !== eventIdValue) {
      return { ok: false, reason: 'option_missing' };
    }

    const existing = await tx.eventEnrollment.findUnique({
      where: {
        optionId_userId: {
          optionId: optionIdValue,
          userId: userIdValue
        }
      }
    });

    if (existing) {
      const existingType = normalizeEnrollmentType(existing.enrollmentType);
      if (existingType === typeValue) {
        return {
          ok: false,
          reason: typeValue === 'FILLER' ? 'already_filler_same_option' : 'already_joined_same_option'
        };
      }
      return { ok: false, reason: 'already_registered_other_state_same_option' };
    }

    if (typeValue === 'PRIMARY') {
      const signedCount = await tx.eventEnrollment.count({
        where: {
          optionId: optionIdValue,
          enrollmentType: 'PRIMARY'
        }
      });
      if (signedCount >= option.capacity) {
        return { ok: false, reason: 'full' };
      }
    }

    await tx.eventEnrollment.create({
      data: {
        eventId: eventIdValue,
        optionId: optionIdValue,
        userId: userIdValue,
        displayName: String(displayName || 'Usuario'),
        isFake: Boolean(isFake),
        enrollmentType: typeValue
      }
    });

    return { ok: true, reason: typeValue === 'FILLER' ? 'joined_as_filler' : 'joined' };
  });
}

async function leaveEventEnrollment(eventId, userId) {
  const result = await prisma.eventEnrollment.deleteMany({
    where: {
      eventId: String(eventId),
      userId: String(userId)
    }
  });

  return result.count > 0;
}

async function leaveEventParticipation(eventId, userId, optionId = null) {
  return await prisma.$transaction(async tx => {
    const whereBase = {
      eventId: String(eventId),
      userId: String(userId)
    };
    const where = optionId ? { ...whereBase, optionId: String(optionId) } : whereBase;

    const enrollment = await tx.eventEnrollment.deleteMany({
      where: {
        ...where
      }
    });
    return enrollment.count > 0;
  });
}

async function clearEventEnrollments(eventId) {
  await prisma.eventEnrollment.deleteMany({
    where: {
      eventId: String(eventId)
    }
  });
}

async function replaceAccessRoles(eventId, roleIdsInput = []) {
  const eventIdValue = String(eventId);
  const roleIds = Array.from(new Set((Array.isArray(roleIdsInput) ? roleIdsInput : []).map(String).filter(Boolean)));

  await prisma.$transaction(async tx => {
    await tx.eventAccessRole.deleteMany({
      where: { eventId: eventIdValue }
    });

    for (let index = 0; index < roleIds.length; index += 1) {
      await tx.eventAccessRole.create({
        data: {
          eventId: eventIdValue,
          roleId: roleIds[index],
          position: index
        }
      });
    }
  });
}

async function listAccessRoles(eventId) {
  const rows = await prisma.eventAccessRole.findMany({
    where: { eventId: String(eventId) },
    orderBy: { position: 'asc' }
  });
  return rows.map(row => row.roleId);
}

async function replaceAccessUsers(eventId, userIdsInput = []) {
  const eventIdValue = String(eventId);
  const userIds = Array.from(new Set((Array.isArray(userIdsInput) ? userIdsInput : []).map(String).filter(Boolean)));

  await prisma.$transaction(async tx => {
    await tx.eventAccessUser.deleteMany({
      where: { eventId: eventIdValue }
    });

    for (let index = 0; index < userIds.length; index += 1) {
      await tx.eventAccessUser.create({
        data: {
          eventId: eventIdValue,
          userId: userIds[index],
          position: index
        }
      });
    }
  });
}

async function listAccessUsers(eventId) {
  const rows = await prisma.eventAccessUser.findMany({
    where: { eventId: String(eventId) },
    orderBy: { position: 'asc' }
  });
  return rows.map(row => row.userId);
}

async function cloneEventOptions(sourceEventId, targetEventId) {
  const sourceOptions = await prisma.eventOption.findMany({
    where: { eventId: String(sourceEventId) },
    orderBy: { position: 'asc' }
  });

  await replaceEventOptions(
    targetEventId,
    sourceOptions.map(option => ({
      position: option.position,
      label: option.label,
      time: option.time,
      capacity: option.capacity
    }))
  );
}

async function resequenceEventOptionPositions(tx, eventIdValue) {
  const options = await tx.eventOption.findMany({
    where: { eventId: eventIdValue },
    orderBy: [
      { position: 'asc' },
      { time: 'asc' }
    ]
  });

  for (let index = 0; index < options.length; index += 1) {
    if (options[index].position === index) continue;
    await tx.eventOption.update({
      where: { id: options[index].id },
      data: { position: index }
    });
  }
}

async function addEventOption(eventId, optionInput = {}, defaultCapacity = 5) {
  const eventIdValue = String(eventId);
  const normalized = normalizeOptionInput(optionInput, 0, defaultCapacity);

  return await prisma.$transaction(async tx => {
    const existingCount = await tx.eventOption.count({
      where: { eventId: eventIdValue }
    });

    const created = await tx.eventOption.create({
      data: {
        eventId: eventIdValue,
        position: existingCount,
        label: normalized.label,
        time: normalized.time,
        capacity: normalized.capacity
      }
    });

    return created;
  });
}

async function updateEventOption(optionId, updates = {}) {
  const optionIdValue = String(optionId);
  const data = {};

  if (Object.prototype.hasOwnProperty.call(updates, 'time')) {
    const timeValue = String(updates.time || '').trim();
    if (!timeValue) throw new Error('Horario invalido.');
    data.time = timeValue;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'label')) {
    const labelValue = String(updates.label || '').trim();
    if (!labelValue) throw new Error('Label invalido.');
    data.label = labelValue;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'capacity')) {
    const capacityValue = Number.parseInt(String(updates.capacity), 10);
    if (!Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 500) {
      throw new Error('Cupo invalido. Debe ser entre 1 y 500.');
    }
    data.capacity = capacityValue;
  }

  return await prisma.eventOption.update({
    where: { id: optionIdValue },
    data
  });
}

async function deleteEventOption(eventId, optionId) {
  const eventIdValue = String(eventId);
  const optionIdValue = String(optionId);

  return await prisma.$transaction(async tx => {
    const target = await tx.eventOption.findUnique({
      where: { id: optionIdValue }
    });
    if (!target || target.eventId !== eventIdValue) {
      return false;
    }

    await tx.eventOption.delete({
      where: { id: optionIdValue }
    });
    await resequenceEventOptionPositions(tx, eventIdValue);
    return true;
  });
}

async function moveEventOption(eventId, optionId, direction) {
  const eventIdValue = String(eventId);
  const optionIdValue = String(optionId);
  const moveDir = String(direction || '').toLowerCase() === 'up' ? -1 : 1;

  return await prisma.$transaction(async tx => {
    const options = await tx.eventOption.findMany({
      where: { eventId: eventIdValue },
      orderBy: [
        { position: 'asc' },
        { time: 'asc' }
      ]
    });
    const index = options.findIndex(option => option.id === optionIdValue);
    if (index < 0) return false;
    const targetIndex = index + moveDir;
    if (targetIndex < 0 || targetIndex >= options.length) return false;

    const current = options[index];
    const target = options[targetIndex];

    await tx.eventOption.update({
      where: { id: current.id },
      data: { position: -1 }
    });
    await tx.eventOption.update({
      where: { id: target.id },
      data: { position: current.position }
    });
    await tx.eventOption.update({
      where: { id: current.id },
      data: { position: target.position }
    });

    return true;
  });
}

async function removeEventEnrollment(eventId, optionId, userId) {
  const result = await prisma.eventEnrollment.deleteMany({
    where: {
      eventId: String(eventId),
      optionId: String(optionId),
      userId: String(userId)
    }
  });
  return result.count > 0;
}

async function promoteFillerToPrimary(eventId, optionId, userId) {
  const eventIdValue = String(eventId);
  const optionIdValue = String(optionId);
  const userIdValue = String(userId);

  return await prisma.$transaction(async tx => {
    const option = await tx.eventOption.findUnique({ where: { id: optionIdValue } });
    if (!option || option.eventId !== eventIdValue) return { ok: false, reason: 'option_missing' };

    const enrollment = await tx.eventEnrollment.findUnique({
      where: {
        optionId_userId: {
          optionId: optionIdValue,
          userId: userIdValue
        }
      }
    });
    if (!enrollment) return { ok: false, reason: 'enrollment_missing' };
    if (normalizeEnrollmentType(enrollment.enrollmentType) !== 'FILLER') {
      return { ok: false, reason: 'not_filler' };
    }

    const signedCount = await tx.eventEnrollment.count({
      where: {
        optionId: optionIdValue,
        enrollmentType: 'PRIMARY'
      }
    });
    if (signedCount >= option.capacity) return { ok: false, reason: 'full' };

    await tx.eventEnrollment.update({
      where: { id: enrollment.id },
      data: { enrollmentType: 'PRIMARY' }
    });
    return { ok: true, reason: 'promoted' };
  });
}

async function moveEventEnrollment(eventId, fromOptionId, toOptionId, userId) {
  const eventIdValue = String(eventId);
  const fromOptionIdValue = String(fromOptionId);
  const toOptionIdValue = String(toOptionId);
  const userIdValue = String(userId);
  if (fromOptionIdValue === toOptionIdValue) return { ok: false, reason: 'same_option' };

  return await prisma.$transaction(async tx => {
    const fromEnrollment = await tx.eventEnrollment.findUnique({
      where: {
        optionId_userId: {
          optionId: fromOptionIdValue,
          userId: userIdValue
        }
      }
    });
    if (!fromEnrollment || fromEnrollment.eventId !== eventIdValue) {
      return { ok: false, reason: 'enrollment_missing' };
    }

    const targetOption = await tx.eventOption.findUnique({
      where: { id: toOptionIdValue }
    });
    if (!targetOption || targetOption.eventId !== eventIdValue) {
      return { ok: false, reason: 'option_missing' };
    }

    const existingTarget = await tx.eventEnrollment.findUnique({
      where: {
        optionId_userId: {
          optionId: toOptionIdValue,
          userId: userIdValue
        }
      }
    });
    if (existingTarget) return { ok: false, reason: 'already_joined_same_option' };

    const enrollmentType = normalizeEnrollmentType(fromEnrollment.enrollmentType);
    if (enrollmentType === 'PRIMARY') {
      const primaryCount = await tx.eventEnrollment.count({
        where: {
          optionId: toOptionIdValue,
          enrollmentType: 'PRIMARY'
        }
      });
      if (primaryCount >= targetOption.capacity) return { ok: false, reason: 'full' };
    }

    await tx.eventEnrollment.update({
      where: { id: fromEnrollment.id },
      data: {
        optionId: toOptionIdValue
      }
    });

    return { ok: true, reason: 'moved' };
  });
}

module.exports = {
  replaceEventOptions,
  listEventOptionsWithEnrollments,
  getEventOption,
  joinEventOption,
  leaveEventEnrollment,
  leaveEventParticipation,
  clearEventEnrollments,
  replaceAccessRoles,
  listAccessRoles,
  replaceAccessUsers,
  listAccessUsers,
  cloneEventOptions,
  addEventOption,
  updateEventOption,
  deleteEventOption,
  moveEventOption,
  removeEventEnrollment,
  promoteFillerToPrimary,
  moveEventEnrollment
};
