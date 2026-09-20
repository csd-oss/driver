import { SNAPSHOT_MS } from './render';

// Two snapshots leave one spare interval for an uneven JS/React delivery. The
// simulation stays authoritative: we never predict a car past a stopping point.
export const NATIVE_PLAYBACK_DELAY = SNAPSHOT_MS * 2;
const HISTORY_SIZE = 6;
const RESET_GAP = 250;
const TELEPORT_DISTANCE = 24;

/** Keep actual simulation times, not the time React happened to commit them. */
export function appendNativePose(history, next) {
  const last = history[history.length - 1];
  if (!last || next.time <= last.time || next.time - last.time > RESET_GAP ||
    Math.hypot(next.x - last.x, next.y - last.y) > TELEPORT_DISTANCE) return [next];
  const angle = last.angle + ((next.angle - last.angle + 540) % 360 + 360) % 360 - 180;
  return [...history.slice(-(HISTORY_SIZE - 1)), { ...next, angle }];
}

/** Read the same delayed world time for every road, vehicle and path hint. */
export function nativePoseAt(history, time) {
  'worklet';
  const first = history[0], last = history[history.length - 1];
  if (time <= first.time) return first;
  if (time >= last.time) return last;
  for (let i = 1; i < history.length; i++) {
    const b = history[i];
    if (time > b.time) continue;
    const a = history[i - 1];
    const fraction = (time - a.time) / (b.time - a.time);
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction,
      angle: a.angle + (b.angle - a.angle) * fraction };
  }
  return last;
}
