// Deterministic grid positions for scheduled Kerala scans. The first position
// is Trivandrum city center; subsequent runs advance rather than restarting.
const ORIGIN = { lat: 8.524139, lng: 76.936638 };

export function spiralPosition(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw Error('Invalid grid index');
  let x = 0, y = 0, dx = 0, dy = -1;
  for (let i = 0; i < index; i++) {
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) [dx, dy] = [-dy, dx];
    x += dx; y += dy;
  }
  return { dx: x, dy: y };
}

export function phaseTasks(phase, previousPhases, lastIndex, batch, completedIndices = null) {
  const offset = previousPhases.reduce((sum, p) => sum + p.estimatedCells, 0);
  const latSteps = Math.ceil((phase.bbox.latMax - phase.bbox.latMin) / phase.grid);
  const lngSteps = Math.ceil((phase.bbox.lngMax - phase.bbox.lngMin) / phase.grid);
  const count = Math.min(latSteps * lngSteps, phase.estimatedCells);
  const tasks = [];
  const done = completedIndices ? new Set(completedIndices) : null;
  for (let position = done ? 0 : Math.max(0, (lastIndex ?? -1) + 1 - offset); position < count && tasks.length < batch; position++) {
    if (done?.has(offset + position)) continue;
    let lat, lng, dx, dy;
    if (phase.phase === 1) {
      ({ dx, dy } = spiralPosition(position));
      lat = ORIGIN.lat + dy * phase.grid;
      lng = ORIGIN.lng + dx * phase.grid;
    } else {
      dx = position % lngSteps;
      dy = Math.floor(position / lngSteps);
      lat = phase.bbox.latMin + (dy + 0.5) * phase.grid;
      lng = phase.bbox.lngMin + (dx + 0.5) * phase.grid;
    }
    if (lat < phase.bbox.latMin || lat > phase.bbox.latMax || lng < phase.bbox.lngMin || lng > phase.bbox.lngMax) continue;
    const index = offset + position;
    tasks.push({ index, lat, lng, grid: phase.grid, radius: phase.radius, center: { lat, lng, dx, dy } });
  }
  return tasks;
}
