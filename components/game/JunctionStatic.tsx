import { Circle, G, Image, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { leftOf, oppositeOf, rightOf } from '@/src/lib/priority/geometry';
import {
  CENTER,
  ISLAND_R,
  LANE,
  RING_R,
  SIZE,
  signPoint,
} from '@/src/lib/priority/layout';
import {
  approachLine,
  armRect,
  boxRect,
  extensionPoints,
  extensionShapes,
  laneLines,
  laneMarkPoint,
  mainRoadBend,
  pedestrianPoint,
  pointsAttr,
  trackRailPaths,
} from './roadShapes';
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
  /** The arm you arrive on: only its signs face you, the other arms show grey sign backs (their shape still tells what they are). */
  ownArm?: string;
  /** Native driving composites live lamps separately from the cached road. */
  renderLights?: boolean;
}

// Rotation that turns "up" into "towards the junction" for traffic arriving on an arm.
const ARM_ROT: Record<string, number> = { S: 0, W: 90, N: 180, E: 270 };

/** Painted give-way triangle or STOP text in the approach lane, so the sign's road is obvious from above. */
const LaneMarking = ({ scene, arm, kind, colour }: { scene: SceneLike; arm: string; kind: 'yield' | 'stop'; colour: string }) => {
  const p = laneMarkPoint(scene, arm);
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
export const LightHead = ({ scene, arm, phase }: { scene: SceneLike; arm: string; phase: LightPhase }) => {
  const p = signPoint(arm, scene.layout, scene);
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

const BACK = '#9ca3af';
const BACK_EDGE = '#4b5563';

/** The grey back of a sign, as seen from the other arms: the shape is all you get. */
const SignBack = ({ kind, x, y }: { kind: string; x: number; y: number }) => {
  const s = 4.2;
  if (kind === 'yield' || kind === 'roundabout-yield') {
    return <Polygon points={`${x - s},${y - s * 0.8} ${x + s},${y - s * 0.8} ${x},${y + s}`} fill={BACK} stroke={BACK_EDGE} strokeWidth={0.5} strokeLinejoin="round" />;
  }
  if (kind === 'stop' || kind === 'roundabout-stop') {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i + Math.PI / 8;
      return `${x + s * Math.cos(a)},${y + s * Math.sin(a)}`;
    }).join(' ');
    return <Polygon points={pts} fill={BACK} stroke={BACK_EDGE} strokeWidth={0.5} />;
  }
  if (kind === 'roundabout') return <Circle cx={x} cy={y} r={s} fill={BACK} stroke={BACK_EDGE} strokeWidth={0.5} />;
  return <Polygon points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`} fill={BACK} stroke={BACK_EDGE} strokeWidth={0.5} />;
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

/**
 * "Tvar križovatky" panel under a main-road sign: the junction from this arm's
 * point of view, the main road thick. Rotated with the arm so up is towards
 * the junction, i.e. the bend goes the way the driver would steer.
 */
const MainShapePanel = ({ scene, arm, x, y, bend }: { scene: SceneLike; arm: string; x: number; y: number; bend: 'left' | 'right' }) => {
  const hw = 3.2;
  const hh = 2.5;
  const sx = bend === 'right' ? 1 : -1;
  const others: string[] = scene.arms ?? [];
  const opposite = oppositeOf(arm);
  const side = bend === 'right' ? leftOf(arm) : rightOf(arm); // the arm the main road does not take
  return (
    // Hung under the diamond in the arm's own frame, so it never lands on the road.
    <G transform={`translate(${x} ${y}) rotate(${ARM_ROT[arm]}) translate(0 7.7)`}>
      <Rect x={-hw} y={-hh} width={2 * hw} height={2 * hh} rx={0.6} fill="#ffffff" stroke="#1f2937" strokeWidth={0.4} />
      {others.includes(opposite) && <Line x1={0} y1={0} x2={0} y2={-hh} stroke="#111827" strokeWidth={0.4} />}
      {others.includes(side) && <Line x1={0} y1={0} x2={-sx * hw} y2={0} stroke="#111827" strokeWidth={0.4} />}
      <Path d={`M 0 ${hh} L 0 0 L ${sx * hw} 0`} fill="none" stroke="#111827" strokeWidth={1.1} strokeLinejoin="round" />
    </G>
  );
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
export const JunctionStatic = ({ scene, dark, extendArms = {}, lights = null, sideExtend = 0, ownArm, renderLights = true }: Props) => {
  const ext = (arm: string) => extendArms[arm] ?? sideExtend;
  const grass = dark ? '#233831' : '#c6d5b7';
  const asphalt = dark ? '#38464c' : '#66777a';
  const marking = dark ? '#cbd5e1' : '#f8fafc';
  const isRoundabout = scene.layout === 'roundabout';
  const kerb = dark ? '#586462' : '#eee7d5';
  const K = 4.2; // kerb width
  const box = boxRect(scene);
  // Deterministic tree spots per quadrant, away from the roads.
  /** An arm's road and its continuation at the same lane width. */
  const armShapes = (arm: string, pad: number, fill: string, tag: string) => {
    const r = armRect(scene, arm, 0);
    const vertical = arm === 'N' || arm === 'S';
    return (
      <G key={`${tag}-${arm}`}>
        {vertical ? (
          <Rect x={r.x - pad} y={r.y} width={r.w + 2 * pad} height={r.h} fill={fill} />
        ) : (
          <Rect x={r.x} y={r.y - pad} width={r.w} height={r.h + 2 * pad} fill={fill} />
        )}
        {extensionShapes(scene, arm, ext(arm)).map((s, i) => (
          <Polygon key={i} points={pointsAttr(extensionPoints(arm, s, pad))} fill={fill} />
        ))}
      </G>
    );
  };
  return (
    <G>
      <Image x={0} y={0} width={SIZE} height={SIZE} href={dark ? require('../../assets/images/driving/junction-dark.png') : require('../../assets/images/driving/junction-light.png')} />
      {/* Kerbs run along the road only; no cap across it, so consecutive
          junction frames join without a seam. */}
      {scene.arms.map((arm) => armShapes(arm, K, kerb, 'kerb'))}
      {!isRoundabout && <Rect x={box.x - K} y={box.y - K} width={box.w + 2 * K} height={box.h + 2 * K} fill={kerb} />}
      {isRoundabout && <Circle cx={CENTER} cy={CENTER} r={RING_R + LANE + 1 + K} fill={kerb} />}
      {scene.arms.map((arm) => armShapes(arm, 0, asphalt, 'road'))}
      {isRoundabout ? (
        <>
          <Circle cx={CENTER} cy={CENTER} r={RING_R + LANE + 1} fill={asphalt} />
          <Circle cx={CENTER} cy={CENTER} r={ISLAND_R} fill={grass} stroke={marking} strokeWidth={0.6} />
        </>
      ) : (
        <Rect x={box.x} y={box.y} width={box.w} height={box.h} fill={asphalt} />
      )}
      {scene.arms.map((arm) =>
        laneLines(scene, arm, ext(arm)).map((l, i) => (
          <Line key={`c-${arm}-${i}`} {...l} stroke={marking} strokeWidth={0.7} strokeDasharray="4 3" />
        )),
      )}
      {scene.arms.map((arm) => {
        const sign = scene.signs?.[arm] ?? null;
        const isStop = sign === 'stop' || sign === 'roundabout-stop';
        const isYield = sign === 'yield' || sign === 'roundabout-yield' || (isRoundabout && sign === 'roundabout');
        if (!isStop && !isYield) return null;
        return (
          <G key={`s-${arm}`}>
            <Line {...approachLine(scene, arm)} stroke={marking} strokeWidth={isStop ? 1.4 : 1} strokeDasharray={isYield ? '1.5 1.2' : undefined} />
            <LaneMarking scene={scene} arm={arm} kind={isStop ? 'stop' : 'yield'} colour={marking} />
          </G>
        );
      })}
      {scene.control?.type === 'lights' &&
        scene.arms.map((arm) => {
          // A stop line for every arm with a light; the lane belongs to that light.
          if (!scene.control?.arms?.[arm] && !lights?.[arm]) return null;
          return <Line key={`ll-${arm}`} {...approachLine(scene, arm)} stroke={marking} strokeWidth={1.4} />;
        })}
      {/* Two tracks per line, one per direction, in the middle of the wide road. */}
      {(scene.tramTracks ?? []).map((t, i) => (
        <G key={`t-${i}`}>
          {trackRailPaths(scene, t, ext(t.from), ext(t.to)).map((d, j) => (
            <Path key={j} d={d} fill="none" stroke="#4b5563" strokeWidth={0.5} />
          ))}
        </G>
      ))}
      {scene.arms.map((arm) => {
        const sign = scene.signs?.[arm] ?? null;
        if (!sign) return null;
        const p = signPoint(arm, scene.layout, scene);
        if (ownArm && arm !== ownArm) {
          if (sign === 'roundabout-yield' || sign === 'roundabout-stop') {
            return (
              <G key={`sign-${arm}`}>
                <SignBack kind={sign} x={p.x} y={p.y - 5} />
                <SignBack kind="roundabout" x={p.x} y={p.y + 4} />
              </G>
            );
          }
          return <SignBack key={`sign-${arm}`} kind={sign} x={p.x} y={p.y} />;
        }
        if (sign === 'roundabout') return <RoundaboutSign key={`sign-${arm}`} x={p.x} y={p.y} />;
        if (sign === 'roundabout-yield' || sign === 'roundabout-stop') {
          return (
            <G key={`sign-${arm}`}>
              <Sign kind={sign === 'roundabout-yield' ? 'yield' : 'stop'} x={p.x} y={p.y - 5} />
              <RoundaboutSign x={p.x} y={p.y + 4} />
            </G>
          );
        }
        const bend = sign === 'main' || sign === 'main-end' ? mainRoadBend(scene, arm) : null;
        return (
          <G key={`sign-${arm}`}>
            <Sign kind={sign} x={p.x} y={p.y} />
            {bend && <MainShapePanel scene={scene} arm={arm} x={p.x} y={p.y} bend={bend} />}
          </G>
        );
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
      {renderLights && scene.control?.type === 'lights' &&
        scene.arms.map((arm) => {
          const live = lights?.[arm];
          const colour = scene.control?.arms?.[arm];
          if (!live && !colour) return null;
          const phase: LightPhase = live ?? (colour === 'red' ? 'red' : 'green');
          return <LightHead key={`light-${arm}`} scene={scene} arm={arm} phase={phase} />;
        })}
      {(scene.pedestrians ?? []).map((p, i) => {
        const a = pedestrianPoint(scene, p.crossing);
        return <Circle key={`ped-${i}`} cx={a.x} cy={a.y} r={1.3} fill="#f97316" />;
      })}
    </G>
  );
};
