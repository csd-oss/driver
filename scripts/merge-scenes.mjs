#!/usr/bin/env node
// Merges data/game/scenes.{a,b,c}.json into data/game/scenes.json and validates the format.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ARMS = new Set(['N', 'E', 'S', 'W']);
const SIGNS = new Set([null, 'yield', 'stop', 'main', 'main-end', 'roundabout', 'roundabout-yield', 'roundabout-stop']);
const KINDS = new Set(['car', 'van', 'truck', 'bus', 'tram', 'motorcycle', 'bicycle', 'emergency']);

const problems = [];
const scenes = [];
for (const part of ['a', 'b', 'c']) {
  const file = `data/game/scenes.${part}.json`;
  if (!existsSync(file)) { problems.push(`${file} missing`); continue; }
  const list = JSON.parse(readFileSync(file, 'utf8'));
  for (const s of list) {
    const where = `${file} ${s.id}`;
    if (!/^ds-?\d+$/.test(s.id || '')) problems.push(`${where}: bad id`);
    if (s.outOfScope) { scenes.push(s); continue; } // not an intersection (lane merge, obstacle)
    if (!['cross', 't', 'roundabout', 'entry'].includes(s.layout)) problems.push(`${where}: layout ${s.layout}`);
    for (const a of s.arms || []) if (!ARMS.has(a)) problems.push(`${where}: arm ${a}`);
    for (const [arm, sign] of Object.entries(s.signs || {})) {
      if (!ARMS.has(arm)) problems.push(`${where}: sign arm ${arm}`);
      if (!SIGNS.has(sign)) problems.push(`${where}: sign ${sign}`);
    }
    const ids = new Set();
    for (const v of s.vehicles || []) {
      if (ids.has(v.id)) problems.push(`${where}: duplicate vehicle ${v.id}`);
      ids.add(v.id);
      if (!KINDS.has(v.kind)) problems.push(`${where}: vehicle ${v.id} kind ${v.kind}`);
      if (v.from !== 'ring' && !ARMS.has(v.from)) problems.push(`${where}: vehicle ${v.id} from ${v.from}`);
      if (v.to !== 'ring' && !ARMS.has(v.to)) problems.push(`${where}: vehicle ${v.id} to ${v.to}`);
    }
    const e = s.expected || {};
    const mentioned = [...(e.order || []).flat(), ...(e.first || []), ...(e.second || []), ...(e.last || []),
      ...(e.priority || []).flat(), ...(e.mayGo || []), ...(e.mustStop || []), ...Object.keys(e.position || {})];
    for (const id of mentioned) if (!ids.has(id)) problems.push(`${where}: expected mentions unknown vehicle ${id}`);
    scenes.push(s);
  }
}
scenes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
writeFileSync('data/game/scenes.json', JSON.stringify(scenes, null, 1));
console.log(`${scenes.length} scenes written to data/game/scenes.json`);
if (problems.length) { console.log('Problems:'); problems.forEach((p) => console.log(' -', p)); process.exit(1); }
