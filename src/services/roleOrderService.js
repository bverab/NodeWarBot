function moveRoleIndex(roles, fromIndex, direction) {
  const list = Array.isArray(roles) ? roles : [];
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= list.length) {
    return { moved: false, roles: list, fromIndex, toIndex: fromIndex };
  }

  const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  if (delta === 0) {
    return { moved: false, roles: list, fromIndex, toIndex: fromIndex };
  }

  const toIndex = fromIndex + delta;
  if (toIndex < 0 || toIndex >= list.length) {
    return { moved: false, roles: list, fromIndex, toIndex: fromIndex };
  }

  const cloned = list.slice();
  const [picked] = cloned.splice(fromIndex, 1);
  cloned.splice(toIndex, 0, picked);
  return { moved: true, roles: cloned, fromIndex, toIndex };
}

module.exports = {
  moveRoleIndex
};

