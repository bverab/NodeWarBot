const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Une un encabezado y filas en un solo mensaje sin pasar el limite de Discord.
 * `total` es la cantidad real de elementos (puede ser mayor que `lines.length`);
 * lo que no cabe se resume al final como "... y N mas".
 */
function buildLimitedList(header, lines, options = {}) {
  const maxLength = Number.isInteger(options.maxLength) ? options.maxLength : DISCORD_MESSAGE_LIMIT;
  const total = Number.isInteger(options.total) ? Math.max(options.total, lines.length) : lines.length;
  const footerFor = hidden => `... y ${hidden} más`;

  const kept = [];
  let length = header.length;
  for (const line of lines) {
    const hiddenAfter = total - (kept.length + 1);
    const footerReserve = hiddenAfter > 0 ? footerFor(hiddenAfter).length + 1 : 0;
    if (length + 1 + line.length + footerReserve > maxLength) break;
    kept.push(line);
    length += 1 + line.length;
  }

  // Ni la primera fila cabe: se recorta para no pasar el limite.
  if (kept.length === 0 && lines.length > 0) {
    const footerReserve = total > 1 ? footerFor(total - 1).length + 1 : 0;
    const room = Math.max(0, maxLength - header.length - 1 - footerReserve);
    kept.push(lines[0].slice(0, Math.max(0, room - 3)) + (room >= 3 ? '...' : ''));
  }

  const hidden = total - kept.length;
  const parts = [header, ...kept];
  if (hidden > 0) parts.push(footerFor(hidden));
  return parts.join('\n');
}

module.exports = {
  DISCORD_MESSAGE_LIMIT,
  buildLimitedList
};
