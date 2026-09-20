/** One stable entry per junction, including an unfinished, terminal mistake. */
export const mergeDriveRecord = (records, record) => {
  const index = records.findIndex(previous => previous.index === record.index);
  if (index < 0) return [...records, record];
  const next = [...records];
  next[index] = record;
  return next;
};

/** Serialize writes so a later completed record cannot be overwritten by an
 * earlier fault. Keep failed snapshots for an explicit retry at drive end. */
export function createDriveRecorder({ write, generateId }) {
  const ids = new Map();
  const pending = new Map();
  let chain = Promise.resolve();
  const save = (record) => {
    if (!ids.has(record.index)) ids.set(record.index, generateId());
    pending.set(record.index, record);
    chain = chain.then(async () => {
      try {
        await write(ids.get(record.index), record);
        if (pending.get(record.index) === record) pending.delete(record.index);
      } catch (error) {
        console.warn('Drive log write failed:', error?.cause?.message || error?.message);
        // Keep this junction's newest snapshot for flush().
      }
    });
  };
  return {
    save,
    async flush() {
      await chain;
      for (const record of [...pending.values()]) save(record);
      await chain;
      return pending.size === 0;
    },
  };
}

export const driveSummary = records => ({
  total: records.length,
  clean: records.filter(record => record.outcome === 'clean').length,
  faults: records.filter(record => record.outcome !== 'clean').length,
  livesLost: records.filter(record => record.lifeLost).length,
  practice: records.filter(record => record.mode !== 'guide').length,
});

export function groupDrives(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.runId)) groups.set(entry.runId, { runId: entry.runId, startedAt: entry.createdAt, latestAt: entry.createdAt, entries: [] });
    const group = groups.get(entry.runId);
    group.startedAt = new Date(Math.min(+group.startedAt, +entry.createdAt));
    group.latestAt = new Date(Math.max(+group.latestAt, +entry.createdAt));
    // Older builds could write duplicate records. Prefer the newest one.
    const previous = group.entries.findIndex(e => e.record.index === entry.record.index);
    if (previous < 0) group.entries.push(entry);
    else {
      const old = group.entries[previous];
      if (+entry.createdAt > +old.createdAt || (+entry.createdAt === +old.createdAt && entry.record.completed && !old.record.completed)) group.entries[previous] = entry;
    }
  }
  return [...groups.values()].sort((a, b) => +b.latestAt - +a.latestAt).map(group => ({ ...group,
    entries: group.entries.sort((a, b) => a.record.index - b.record.index),
    ...driveSummary(group.entries.map(entry => entry.record)),
  }));
}
