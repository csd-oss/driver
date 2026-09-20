/** Keep the rotating viewport inside its cached patch, including anchor rounding. */
export const roadPatch = (x, y, span, viewHeight) => ({
  anchorX: Math.round(x / 64) * 64,
  anchorY: Math.round(y / 64) * 64,
  // Both axes can round by 32: allow the diagonal error, not only one axis.
  half: Math.ceil(Math.hypot(span / 2, viewHeight * 0.72) + Math.SQRT2 * 32 + 8),
});

export const patchKey = ({ anchorX, anchorY, half }) => `${anchorX}:${anchorY}:${half}`;

/** Keep the last painted origin beneath its replacement while SVG mounts.
 * Both use world coordinates, so overlapping patches show exactly the same road.
 * Two slots bound memory and also reuse mounted views when crossing back again.
 */
export function retainRoadPatches(patches, next) {
  const key = patchKey(next);
  if (patches.length && patchKey(patches[patches.length - 1]) === key) return patches;
  const existing = patches.find(patch => patchKey(patch) === key);
  return [...patches.filter(patch => patchKey(patch) !== key).slice(-1), existing ?? next];
}

/** Native compositor projection. One shared camera drives roads and all cars. */
export function projectVehicle(x, y, angle, cameraX, cameraY, heading, scale, width, height, shake) {
  'worklet';
  const a = -heading * Math.PI / 180;
  const dx = x - cameraX, dy = y - cameraY;
  return {
    x: width / 2 + (dx * Math.cos(a) - dy * Math.sin(a) + shake) * scale,
    y: height * 0.72 + (dx * Math.sin(a) + dy * Math.cos(a)) * scale,
    angle: angle - heading,
  };
}

export const SNAPSHOT_MS = 1000 / 30;

/** Phase-locked snapshots: callback jitter must not add another vsync of waiting. */
export function nextSnapshotAt(deadline, time) {
  if (time + 2 < deadline) return deadline;
  // Drop missed slots after a stall; never run a burst of catch-up React commits.
  return deadline + Math.max(1, Math.floor((time + 2 - deadline) / SNAPSHOT_MS) + 1) * SNAPSHOT_MS;
}
