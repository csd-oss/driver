const roadExit = junction => junction.scene.vehicles.find(vehicle => vehicle.id === 'you')?.to ?? null;

/** Capture primitives: simulation junctions are mutable, so comparing old
 * junction objects would miss a changed route or connecting-road length. */
export function captureRoadLayout(junctions) {
  return junctions.map(junction => ({
    index: junction.index, cx: junction.cx, cy: junction.cy, rot: junction.rot,
    scene: junction.scene, gapBefore: junction.gapBefore, gapAfter: junction.gapAfter,
    exit: roadExit(junction),
  }));
}

export function sameRoadLayout(layout, junctions) {
  return layout.length === junctions.length && layout.every((previous, index) => {
    const junction = junctions[index];
    return previous.index === junction.index && previous.cx === junction.cx && previous.cy === junction.cy &&
      previous.rot === junction.rot && previous.scene === junction.scene && previous.gapBefore === junction.gapBefore &&
      previous.gapAfter === junction.gapAfter && previous.exit === roadExit(junction);
  });
}
