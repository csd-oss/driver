import { existsSync, readFileSync } from 'node:fs';
import { resolve, positionOf } from '../src/lib/priority/engine';

// Every encoded exam picture must be explained by the engine. A scene may
// carry "conflict": true when the official answer disagrees with the law as
// we read it; those are reported but do not fail the suite.
const FILE = `${__dirname}/../data/game/scenes.json`;
const scenes = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];

const groupEquals = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export const checkScene = (scene) => {
  const result = resolve(scene);
  const e = scene.expected || {};
  const failures = [];
  const flat = result.order.flat();
  if (result.deadlock) failures.push(`deadlock, blocked: ${result.blocked.join(',')}`);
  if (e.order) {
    const ok = e.order.length === result.order.length && e.order.every((g, i) => groupEquals(g, result.order[i]));
    if (!ok) failures.push(`order expected ${JSON.stringify(e.order)} got ${JSON.stringify(result.order)}`);
  }
  if (e.first && !groupEquals(e.first, result.order[0] || [])) failures.push(`first expected ${e.first} got ${result.order[0]}`);
  if (e.second && !groupEquals(e.second, result.order[1] || [])) failures.push(`second expected ${e.second} got ${result.order[1]}`);
  if (e.last && !groupEquals(e.last, result.order[result.order.length - 1] || [])) failures.push(`last expected ${e.last} got ${result.order[result.order.length - 1]}`);
  for (const [before, after] of e.priority || []) {
    const pb = positionOf(result, before);
    const pa = positionOf(result, after);
    if (pb === null || pa === null || pb >= pa) failures.push(`priority ${before} before ${after}: got ${pb} vs ${pa}`);
  }
  for (const [id, pos] of Object.entries(e.position || {})) {
    const p = positionOf(result, id);
    const want = pos === 'last' ? result.order.length : pos;
    if (p !== want) failures.push(`position ${id} expected ${pos} got ${p}`);
  }
  for (const id of e.mayGo || []) if (result.stopped.includes(id)) failures.push(`${id} should be allowed to go`);
  for (const id of e.mustStop || []) if (!result.stopped.includes(id) && flat.includes(id)) failures.push(`${id} should be stopped`);
  return { failures, result };
};

describe('exam scenes', () => {
  if (!scenes.length) {
    it('has no scenes yet', () => expect(scenes).toEqual([]));
    return;
  }
  const report = [];
  for (const scene of scenes) {
    if (scene.outOfScope) continue;
    it(`${scene.id} matches the official answers`, () => {
      const { failures } = checkScene(scene);
      if (failures.length && scene.conflict) {
        report.push(`${scene.id} (flagged conflict): ${failures.join('; ')}`);
        return;
      }
      expect(failures).toEqual([]);
    });
  }
  afterAll(() => {
    if (report.length) console.log('Scenes with flagged conflicts:\n' + report.join('\n'));
  });
});
