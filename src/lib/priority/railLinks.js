/** Visual rail connections between separately generated junctions.
 * Existing tram movements are unchanged. A line that reaches the next
 * street turns into a side road there instead of ending halfway along it.
 */
export const railLinks = junctions => {
  const extras = new Map(junctions.map(j => [j.index, []]));
  const tracks = j => [...(j.scene.tramTracks || []), ...extras.get(j.index)];
  const carries = (j, arm) => tracks(j).some(t => t.from === arm || t.to === arm);
  const exit = j => j.scene.vehicles.find(v => v.id === 'you')?.to;
  const extend = (j, arm) => {
    if (carries(j, arm)) return false;
    const connected = tracks(j).flatMap(t => [t.from, t.to]);
    const side = j.scene.arms.find(a => a !== arm && a !== 'S' && a !== exit(j));
    const to = connected.find(a => a !== arm) || side || j.scene.arms.find(a => a !== arm);
    if (!to) return false;
    extras.get(j.index).push({ from: arm, to });
    return true;
  };
  // A straight two-arm street can carry the connection on to the next
  // available side street. Bound propagation by the number of junctions.
  for (let pass = 0; pass < junctions.length; pass++) {
    let changed = false;
    for (let i = 1; i < junctions.length; i++) {
      const before = junctions[i - 1], after = junctions[i];
      if (after.index !== before.index + 1) continue;
      const out = exit(before);
      if (carries(before, out) && !carries(after, 'S')) changed = extend(after, 'S') || changed;
      else if (carries(after, 'S') && !carries(before, out)) changed = extend(before, out) || changed;
    }
    if (!changed) break;
  }
  return extras;
};
