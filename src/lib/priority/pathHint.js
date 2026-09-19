/** A short preview along the actual lane, starting at the moving vehicle.
 * In particular, a roundabout approach must include its entry bend and
 * circulating arc instead of drawing a chord to the later waiting point.
 */
export const pathHint = (path, progress, from, span) => {
  if (progress >= 0.9) return [];
  const points = progress === 0 && from ? [...path.approach, ...path.through] : path.through;
  const start = from || points[Math.floor(progress * (points.length - 1))];
  let segment = 0, nearest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const fraction = Math.max(0, Math.min(1, ((start.x - a.x) * dx + (start.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const distance = Math.hypot(start.x - a.x - fraction * dx, start.y - a.y - fraction * dy);
    if (distance < nearest) { nearest = distance; segment = i; }
  }
  let remaining = Math.max(12, 70 * span);
  const shown = [start];
  for (let i = segment; i < points.length && remaining > 0; i++) {
    const a = shown[shown.length - 1], b = points[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < 0.01) continue;
    const fraction = Math.min(1, remaining / distance);
    shown.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
    remaining -= distance;
  }
  return shown;
};
