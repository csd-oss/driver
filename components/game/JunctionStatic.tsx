import { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import {
  CENTER,
  EDGE,
  ISLAND_R,
  LANE,
  RING_R,
  ROAD_HALF,
  SIZE,
  approachPoint,
  signPoint,
} from '@/src/lib/priority/layout';
import type { SceneLike } from './types';

export type LightPhase = 'red' | 'redyellow' | 'green' | 'yellow';

interface Props {
  scene: SceneLike;
  dark: boolean;
  /** Extra road length beyond the 100 x 100 frame per arm (endless road). */
  extendArms?: Partial<Record<string, number>>;
  /** Live traffic-light phase per arm (runner); falls back to the scene's static colours. */
  lights?: Record<string, LightPhase> | null;
  /** Extra length for arms not listed in `extendArms`, so side roads run off screen instead of ending in the grass. */
  sideExtend?: number;
}

// Rotation that turns "up" into "towards the junction" for traffic arriving on an arm.
const ARM_ROT: Record<string, number> = { S: 0, W: 90, N: 180, E: 270 };

/** Painted give-way triangle or STOP text in the approach lane, so the sign's road is obvious from above. */
const LaneMarking = ({ arm, layout, kind, colour }: { arm: string; layout: string; kind: 'yield' | 'stop'; colour: string }) => {
  const d = (layout === 'roundabout' ? RING_R + LANE + 1 : ROAD_HALF + 1) + 6;
  const p = approachPoint(arm, d);
  return (
    <G transform={`translate(${p.x} ${p.y}) rotate(${ARM_ROT[arm]})`}>
      {kind === 'yield' ? (
        <Polygon points="-2.6,2.4 2.6,2.4 0,-3" fill="none" stroke={colour} strokeWidth={0.9} strokeLinejoin="round" />
      ) : (
        <SvgText x={0} y={1.2} fontSize={3.4} fontWeight="700" fill={colour} textAnchor="middle">STOP</SvgText>
      )}
    </G>
  );
};

/** Three-lamp traffic light head beside the lane, lit for the given phase. */
const LightHead = ({ arm, layout, phase }: { arm: string; layout: string; phase: LightPhase }) => {
  const p = signPoint(arm, layout);
  const on = (lamp: 'red' | 'yellow' | 'green') =>
    (lamp === 'red' && (phase === 'red' || phase === 'redyellow')) ||
    (lamp === 'yellow' && (phase === 'yellow' || phase === 'redyellow')) ||
    (lamp === 'green' && phase === 'green');
  const lampFill = (lamp: 'red' | 'yellow' | 'green') =>
    on(lamp) ? { red: '#ef4444', yellow: '#facc15', green: '#22c55e' }[lamp] : { red: '#5b1a1a', yellow: '#5a4a10', green: '#14421f' }[lamp];
  return (
    <G transform={`translate(${p.x} ${p.y}) rotate(${ARM_ROT[arm]})`}>
      <Rect x={-2.4} y={-5.6} width={4.8} height={11.2} rx={1.2} fill="#111827" stroke="#f8fafc" strokeWidth={0.4} />
      <Circle cx={0} cy={-3.4} r={1.5} fill={lampFill('red')} />
      <Circle cx={0} cy={0} r={1.5} fill={lampFill('yellow')} />
      <Circle cx={0} cy={3.4} r={1.5} fill={lampFill('green')} />
    </G>
  );
};

const armRect = (arm: string, extend: number) => {
  switch (arm) {
    case 'N': return { x: EDGE, y: -extend, w: ROAD_HALF * 2, h: CENTER + extend };
    case 'S': return { x: EDGE, y: CENTER, w: ROAD_HALF * 2, h: CENTER + extend };
    case 'W': return { x: -extend, y: EDGE, w: CENTER + extend, h: ROAD_HALF * 2 };
    default: return { x: CENTER, y: EDGE, w: CENTER + extend, h: ROAD_HALF * 2 };
  }
};

const centreLine = (arm: string, layout: string, extend: number) => {
  const inner = layout === 'roundabout' ? RING_R + LANE : ROAD_HALF;
  switch (arm) {
    case 'N': return { x1: CENTER, y1: -extend, x2: CENTER, y2: CENTER - inner };
    case 'S': return { x1: CENTER, y1: SIZE + extend, x2: CENTER, y2: CENTER + inner };
    case 'W': return { x1: -extend, y1: CENTER, x2: CENTER - inner, y2: CENTER };
    default: return { x1: SIZE + extend, y1: CENTER, x2: CENTER + inner, y2: CENTER };
  }
};

const approachLine = (arm: string, layout: string) => {
  const d = layout === 'roundabout' ? RING_R + LANE + 1 : ROAD_HALF + 1;
  const a = approachPoint(arm, d);
  if (arm === 'N' || arm === 'S') return { x1: a.x - LANE, y1: a.y, x2: a.x + LANE, y2: a.y };
  return { x1: a.x, y1: a.y - LANE, x2: a.x, y2: a.y + LANE };
};

const Sign = ({ kind, x, y }: { kind: string; x: number; y: number }) => {
  const s = 4.2;
  if (kind === 'yield') {
    return <Polygon points={`${x - s},${y - s * 0.8} ${x + s},${y - s * 0.8} ${x},${y + s}`} fill="#ffffff" stroke="#dc2626" strokeWidth={1.4} strokeLinejoin="round" />;
  }
  if (kind === 'stop') {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i + Math.PI / 8;
      return `${x + s * Math.cos(a)},${y + s * Math.sin(a)}`;
    }).join(' ');
    return (
      <G>
        <Polygon points={pts} fill="#dc2626" stroke="#ffffff" strokeWidth={0.6} />
        <SvgText x={x} y={y + 1.1} fontSize={2.6} fontWeight="700" fill="#ffffff" textAnchor="middle">STOP</SvgText>
      </G>
    );
  }
  if (kind === 'main' || kind === 'main-end') {
    return (
      <G>
        <Polygon points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`} fill="#ffffff" stroke="#1f2937" strokeWidth={0.4} />
        <Polygon points={`${x},${y - s * 0.6} ${x + s * 0.6},${y} ${x},${y + s * 0.6} ${x - s * 0.6},${y}`} fill="#facc15" />
        {kind === 'main-end' && <Line x1={x - s} y1={y + s} x2={x + s} y2={y - s} stroke="#1f2937" strokeWidth={0.9} />}
      </G>
    );
  }
  return null;
};

/** Blue "roundabout" disc: three white arrows chasing each other counter-clockwise (as driven). */
const RoundaboutSign = ({ x, y }: { x: number; y: number }) => {
  const r = 2.3;
  const pt = (deg: number) => ({ x: x + r * Math.sin((deg * Math.PI) / 180), y: y - r * Math.cos((deg * Math.PI) / 180) });
  const arrows = [0, 120, 240].map((start) => {
    // Arc from `start` going counter-clockwise on screen (decreasing angle) for 75°, arrowhead at the end.
    const a = pt(start);
    const b = pt(start - 75);
    const tipDeg = start - 75;
    const dir = { x: -Math.cos((tipDeg * Math.PI) / 180), y: -Math.sin((tipDeg * Math.PI) / 180) }; // tangent, ccw
    const tip = { x: b.x + dir.x * 1.1, y: b.y + dir.y * 1.1 };
    const left = { x: b.x - dir.y * 0.9, y: b.y + dir.x * 0.9 };
    const right = { x: b.x + dir.y * 0.9, y: b.y - dir.x * 0.9 };
    return { d: `M ${a.x} ${a.y} A ${r} ${r} 0 0 0 ${b.x} ${b.y}`, head: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}` };
  });
  return (
    <G>
      <Circle cx={x} cy={y} r={4.2} fill="#1d4ed8" stroke="#ffffff" strokeWidth={0.6} />
      {arrows.map((ar, i) => (
        <G key={i}>
          <Path d={ar.d} stroke="#ffffff" strokeWidth={0.8} fill="none" />
          <Polygon points={ar.head} fill="#ffffff" />
        </G>
      ))}
    </G>
  );
};

/** Roads, markings, signs, tracks, officer, lights, pedestrians of one junction, in its local frame. */
export const JunctionStatic = ({ scene, dark, extendArms = {}, lights = null, sideExtend = 0 }: Props) => {
  const ext = (arm: string) => extendArms[arm] ?? sideExtend;
  const grass = dark ? '#1a2e1a' : '#cfe8bf';
  const asphalt = dark ? '#334155' : '#8f96a3';
  const marking = dark ? '#cbd5e1' : '#f8fafc';
  const isRoundabout = scene.layout === 'roundabout';
  const kerb = dark ? '#475569' : '#d6d3d1';
  const treeFill = dark ? '#245c2e' : '#3f9c4a';
  const treeDark = dark ? '#1b4522' : '#2f7a38';
  const K = 2.2; // kerb width
  // Deterministic tree spots per quadrant, away from the roads.
  const trees = [
    { x: 12, y: 12, r: 4 }, { x: 24, y: 8, r: 2.6 }, { x: 8, y: 26, r: 3 },
    { x: 88, y: 12, r: 3.6 }, { x: 76, y: 8, r: 2.4 }, { x: 92, y: 26, r: 2.8 },
    { x: 12, y: 88, r: 3.4 }, { x: 24, y: 92, r: 2.6 }, { x: 8, y: 74, r: 2.8 },
    { x: 88, y: 88, r: 4 }, { x: 76, y: 92, r: 2.4 }, { x: 92, y: 74, r: 3 },
  ];
  return (
    <G>
      <Rect x={0} y={0} width={SIZE} height={SIZE} fill={grass} />
      {trees.map((tr, i) => (
        <G key={`tree-${i}`}>
          <Circle cx={tr.x + 0.6} cy={tr.y + 0.8} r={tr.r} fill="rgba(0,0,0,0.18)" />
          <Circle cx={tr.x} cy={tr.y} r={tr.r} fill={treeFill} />
          <Circle cx={tr.x - tr.r * 0.3} cy={tr.y - tr.r * 0.3} r={tr.r * 0.55} fill={treeDark} opacity={0.5} />
        </G>
      ))}
      {scene.arms.map((arm) => {
        // Kerbs run along the road only; no cap across it, so consecutive
        // junction frames join without a seam.
        const r = armRect(arm, ext(arm));
        const vertical = arm === 'N' || arm === 'S';
        return vertical ? (
          <Rect key={`kerb-${arm}`} x={r.x - K} y={r.y} width={r.w + 2 * K} height={r.h} fill={kerb} />
        ) : (
          <Rect key={`kerb-${arm}`} x={r.x} y={r.y - K} width={r.w} height={r.h + 2 * K} fill={kerb} />
        );
      })}
      {!isRoundabout && <Rect x={EDGE - K} y={EDGE - K} width={ROAD_HALF * 2 + 2 * K} height={ROAD_HALF * 2 + 2 * K} fill={kerb} />}
      {isRoundabout && <Circle cx={CENTER} cy={CENTER} r={RING_R + LANE + 1 + K} fill={kerb} />}
      {scene.arms.map((arm) => {
        const r = armRect(arm, ext(arm));
        return <Rect key={arm} x={r.x} y={r.y} width={r.w} height={r.h} fill={asphalt} />;
      })}
      {isRoundabout ? (
        <>
          <Circle cx={CENTER} cy={CENTER} r={RING_R + LANE + 1} fill={asphalt} />
          <Circle cx={CENTER} cy={CENTER} r={ISLAND_R} fill={grass} stroke={marking} strokeWidth={0.6} />
        </>
      ) : (
        <Rect x={EDGE} y={EDGE} width={ROAD_HALF * 2} height={ROAD_HALF * 2} fill={asphalt} />
      )}
      {scene.arms.map((arm) => (
        <Line key={`c-${arm}`} {...centreLine(arm, scene.layout, ext(arm))} stroke={marking} strokeWidth={0.7} strokeDasharray="4 3" />
      ))}
      {scene.arms.map((arm) => {
        const sign = scene.signs?.[arm] ?? null;
        const isStop = sign === 'stop' || sign === 'roundabout-stop';
        const isYield = sign === 'yield' || sign === 'roundabout-yield' || (isRoundabout && sign === 'roundabout');
        if (!isStop && !isYield) return null;
        return (
          <G key={`s-${arm}`}>
            <Line {...approachLine(arm, scene.layout)} stroke={marking} strokeWidth={isStop ? 1.4 : 1} strokeDasharray={isYield ? '1.5 1.2' : undefined} />
            <LaneMarking arm={arm} layout={scene.layout} kind={isStop ? 'stop' : 'yield'} colour={marking} />
          </G>
        );
      })}
      {scene.control?.type === 'lights' &&
        scene.arms.map((arm) => {
          // A stop line for every arm with a light; the lane belongs to that light.
          if (!scene.control?.arms?.[arm] && !lights?.[arm]) return null;
          return <Line key={`ll-${arm}`} {...approachLine(arm, scene.layout)} stroke={marking} strokeWidth={1.4} />;
        })}
      {(scene.tramTracks ?? []).map((t, i) => {
        const horizontal = (t.from === 'W' && t.to === 'E') || (t.from === 'E' && t.to === 'W');
        return horizontal ? (
          <G key={`t-${i}`}>
            <Line x1={0} y1={CENTER - 1.4} x2={SIZE} y2={CENTER - 1.4} stroke="#4b5563" strokeWidth={0.5} />
            <Line x1={0} y1={CENTER + 1.4} x2={SIZE} y2={CENTER + 1.4} stroke="#4b5563" strokeWidth={0.5} />
          </G>
        ) : (
          <G key={`t-${i}`}>
            <Line x1={CENTER - 1.4} y1={0} x2={CENTER - 1.4} y2={SIZE} stroke="#4b5563" strokeWidth={0.5} />
            <Line x1={CENTER + 1.4} y1={0} x2={CENTER + 1.4} y2={SIZE} stroke="#4b5563" strokeWidth={0.5} />
          </G>
        );
      })}
      {scene.arms.map((arm) => {
        const sign = scene.signs?.[arm] ?? null;
        if (!sign) return null;
        const p = signPoint(arm, scene.layout);
        if (sign === 'roundabout') return <RoundaboutSign key={`sign-${arm}`} x={p.x} y={p.y} />;
        if (sign === 'roundabout-yield' || sign === 'roundabout-stop') {
          return (
            <G key={`sign-${arm}`}>
              <Sign kind={sign === 'roundabout-yield' ? 'yield' : 'stop'} x={p.x} y={p.y - 5} />
              <RoundaboutSign x={p.x} y={p.y + 4} />
            </G>
          );
        }
        return <Sign key={`sign-${arm}`} kind={sign} x={p.x} y={p.y} />;
      })}
      {scene.control?.type === 'police' && (
        <G transform={`translate(${CENTER} ${CENTER}) rotate(${{ N: 0, E: 90, S: 180, W: 270 }[scene.control.facing ?? 'S']})`}>
          <Circle cx={0} cy={0} r={2.2} fill="#1e3a8a" />
          <Circle cx={0} cy={-1.6} r={1.2} fill="#fcd9b6" />
          {scene.control.pose === 'arms-sides' && <Line x1={-5} y1={0} x2={5} y2={0} stroke="#1e3a8a" strokeWidth={1.2} />}
          {scene.control.pose === 'right-forward-left-side' && (
            <>
              <Line x1={0} y1={0} x2={0} y2={5.5} stroke="#1e3a8a" strokeWidth={1.2} />
              <Line x1={0} y1={0} x2={5} y2={0} stroke="#1e3a8a" strokeWidth={1.2} />
            </>
          )}
          {scene.control.pose === 'arm-raised' && <Circle cx={2.4} cy={-3} r={1} fill="#fcd9b6" />}
        </G>
      )}
      {scene.control?.type === 'lights' &&
        scene.arms.map((arm) => {
          const live = lights?.[arm];
          const colour = scene.control?.arms?.[arm];
          if (!live && !colour) return null;
          const phase: LightPhase = live ?? (colour === 'red' ? 'red' : 'green');
          return <LightHead key={`light-${arm}`} arm={arm} layout={scene.layout} phase={phase} />;
        })}
      {(scene.pedestrians ?? []).map((p, i) => {
        const a = approachPoint(p.crossing, ROAD_HALF + 2.5);
        return <Circle key={`ped-${i}`} cx={a.x - LANE} cy={a.y} r={1.3} fill="#f97316" />;
      })}
    </G>
  );
};
