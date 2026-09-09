import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import {
  CENTER,
  EDGE,
  FAR,
  ISLAND_R,
  LANE,
  RING_R,
  ROAD_HALF,
  SIZE,
  approachPoint,
  pointAlong,
  signPoint,
  vehiclePath,
} from '@/src/lib/priority/layout';

export interface VehiclePose {
  x: number;
  y: number;
  angle: number;
}

interface SceneVehicle {
  id: string;
  kind: string;
  color: string;
  from: string;
  to: string;
}

export interface SceneLike {
  layout: string;
  arms: string[];
  signs?: Record<string, string | null>;
  mainRoad?: string[] | null;
  tramTracks?: { from: string; to: string }[];
  control?: { type: string; pose?: string; facing?: string; arms?: Record<string, string> } | null;
  vehicles: SceneVehicle[];
  pedestrians?: { crossing: string; onCrossing?: boolean }[];
}

interface Props {
  scene: SceneLike;
  size: number;
  /** Current pose per vehicle id; vehicles without one wait at their entry. */
  poses?: Record<string, VehiclePose>;
  /** Draw each vehicle's intended path as a thin dashed line. */
  showPaths?: boolean;
  /** Ids to draw with a glow (e.g. the vehicle that caused a crash). */
  highlight?: string[];
  hidden?: string[];
}

export const VEHICLE_FILL: Record<string, string> = {
  you: '#4f46e5',
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  yellow: '#eab308',
  white: '#f1f5f9',
  black: '#1f2937',
  tram: '#b91c1c',
};

const ARM_RECT: Record<string, { x: number; y: number; w: number; h: number }> = {
  N: { x: EDGE, y: 0, w: ROAD_HALF * 2, h: CENTER },
  S: { x: EDGE, y: CENTER, w: ROAD_HALF * 2, h: CENTER },
  W: { x: 0, y: EDGE, w: CENTER, h: ROAD_HALF * 2 },
  E: { x: CENTER, y: EDGE, w: CENTER, h: ROAD_HALF * 2 },
};

// Centre-line dashes for an arm, from the outer edge to the crossing box.
const centreLine = (arm: string, layout: string) => {
  const inner = layout === 'roundabout' ? RING_R + LANE : ROAD_HALF;
  switch (arm) {
    case 'N': return { x1: CENTER, y1: 0, x2: CENTER, y2: CENTER - inner };
    case 'S': return { x1: CENTER, y1: SIZE, x2: CENTER, y2: CENTER + inner };
    case 'W': return { x1: 0, y1: CENTER, x2: CENTER - inner, y2: CENTER };
    default: return { x1: SIZE, y1: CENTER, x2: CENTER + inner, y2: CENTER };
  }
};

// Stop / yield line across the approach lane of an arm.
const approachLine = (arm: string, layout: string) => {
  const d = layout === 'roundabout' ? RING_R + LANE + 1 : ROAD_HALF + 1;
  const a = approachPoint(arm, d);
  switch (arm) {
    case 'N': return { x1: a.x - LANE, y1: a.y, x2: a.x + LANE, y2: a.y };
    case 'S': return { x1: a.x - LANE, y1: a.y, x2: a.x + LANE, y2: a.y };
    default: return { x1: a.x, y1: a.y - LANE, x2: a.x, y2: a.y + LANE };
  }
};

const Sign = ({ kind, x, y }: { kind: string; x: number; y: number }) => {
  const s = 4.2;
  if (kind === 'yield') {
    return (
      <G>
        <Polygon points={`${x - s},${y - s * 0.8} ${x + s},${y - s * 0.8} ${x},${y + s}`} fill="#ffffff" stroke="#dc2626" strokeWidth={1.4} strokeLinejoin="round" />
      </G>
    );
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

const RoundaboutSign = ({ x, y }: { x: number; y: number }) => (
  <G>
    <Circle cx={x} cy={y} r={4.2} fill="#1d4ed8" stroke="#ffffff" strokeWidth={0.6} />
    <Path d={`M ${x - 2.2} ${y - 0.6} A 2.4 2.4 0 1 1 ${x + 2.2} ${y - 0.6}`} stroke="#ffffff" strokeWidth={1} fill="none" />
    <Polygon points={`${x - 2.9},${y - 0.2} ${x - 1.4},${y - 0.2} ${x - 2.15},${y + 1.4}`} fill="#ffffff" />
    <Polygon points={`${x + 1.4},${y - 0.2} ${x + 2.9},${y - 0.2} ${x + 2.15},${y - 1.8}`} fill="#ffffff" />
  </G>
);

const Vehicle = ({ v, pose, glow, dim }: { v: SceneVehicle; pose: VehiclePose; glow?: boolean; dim?: boolean }) => {
  const fill = VEHICLE_FILL[v.color] ?? '#64748b';
  const isTram = v.kind === 'tram';
  const w = isTram ? 6 : v.kind === 'van' || v.kind === 'truck' || v.kind === 'bus' ? 6.4 : 5.6;
  const h = isTram ? 20 : v.kind === 'van' ? 11 : v.kind === 'truck' || v.kind === 'bus' ? 13 : 9.5;
  return (
    <G transform={`translate(${pose.x} ${pose.y}) rotate(${pose.angle})`} opacity={dim ? 0.35 : 1}>
      {glow && <Rect x={-w / 2 - 1.6} y={-h / 2 - 1.6} width={w + 3.2} height={h + 3.2} rx={2.6} fill="none" stroke="#f59e0b" strokeWidth={1.2} />}
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} rx={isTram ? 1.2 : 1.6} fill={fill} stroke="rgba(0,0,0,0.35)" strokeWidth={0.4} />
      {isTram ? (
        <>
          <Rect x={-w / 2 + 0.8} y={-h / 2 + 1} width={w - 1.6} height={2} fill="#fde68a" />
          <Line x1={-w / 2 + 0.8} y1={-h / 2 + 5} x2={w / 2 - 0.8} y2={-h / 2 + 5} stroke="#fde68a" strokeWidth={0.6} />
          <Line x1={-w / 2 + 0.8} y1={0} x2={w / 2 - 0.8} y2={0} stroke="#fde68a" strokeWidth={0.6} />
          <Line x1={-w / 2 + 0.8} y1={h / 2 - 5} x2={w / 2 - 0.8} y2={h / 2 - 5} stroke="#fde68a" strokeWidth={0.6} />
        </>
      ) : (
        <>
          <Rect x={-w / 2 + 0.7} y={-h / 2 + 2.2} width={w - 1.4} height={2.2} rx={0.6} fill="rgba(255,255,255,0.75)" />
          <Rect x={-w / 2 + 0.7} y={h / 2 - 2.8} width={w - 1.4} height={1.6} rx={0.5} fill="rgba(255,255,255,0.45)" />
        </>
      )}
      {v.id === 'you' && <Circle cx={0} cy={0} r={1.4} fill="#ffffff" />}
    </G>
  );
};

/**
 * Top-down drawing of a scene. Pure and cheap: give it poses per frame and
 * it redraws only the vehicles that moved.
 */
export const IntersectionScene = ({ scene, size, poses, showPaths, highlight = [], hidden = [] }: Props) => {
  const dark = useColorScheme() === 'dark';
  const grass = dark ? '#1a2e1a' : '#cfe8bf';
  const asphalt = dark ? '#334155' : '#8f96a3';
  const marking = dark ? '#cbd5e1' : '#f8fafc';
  const isRoundabout = scene.layout === 'roundabout';

  const restingPoses = useMemo(() => {
    const out: Record<string, VehiclePose> = {};
    for (const v of scene.vehicles) {
      const path = vehiclePath(scene, v);
      out[v.id] = pointAlong(path.through, 0.001);
    }
    return out;
  }, [scene]);

  const paths = useMemo(
    () =>
      showPaths
        ? scene.vehicles.map((v) => ({
            id: v.id,
            d: vehiclePath(scene, v).through.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
          }))
        : [],
    [scene, showPaths]
  );

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Rect x={0} y={0} width={SIZE} height={SIZE} fill={grass} />

      {/* Roads */}
      {scene.arms.map((arm) => {
        const r = ARM_RECT[arm];
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

      {/* Lane markings */}
      {scene.arms.map((arm) => {
        const l = centreLine(arm, scene.layout);
        return <Line key={`c-${arm}`} {...l} stroke={marking} strokeWidth={0.7} strokeDasharray="4 3" />;
      })}
      {scene.arms.map((arm) => {
        const sign = scene.signs?.[arm] ?? null;
        const isStop = sign === 'stop' || sign === 'roundabout-stop';
        const isYield = sign === 'yield' || sign === 'roundabout-yield' || (isRoundabout && sign === 'roundabout');
        if (!isStop && !isYield) return null;
        const l = approachLine(arm, scene.layout);
        return (
          <Line
            key={`s-${arm}`}
            {...l}
            stroke={marking}
            strokeWidth={isStop ? 1.4 : 1}
            strokeDasharray={isYield ? '1.5 1.2' : undefined}
          />
        );
      })}

      {/* Tram tracks */}
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

      {/* Signs */}
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

      {/* Police officer */}
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

      {/* Traffic lights */}
      {scene.control?.type === 'lights' &&
        scene.arms.map((arm) => {
          const colour = scene.control?.arms?.[arm];
          if (!colour) return null;
          const p = signPoint(arm, scene.layout);
          return <Circle key={`light-${arm}`} cx={p.x} cy={p.y} r={2.6} fill={colour === 'red' ? '#ef4444' : '#22c55e'} stroke="#111827" strokeWidth={0.8} />;
        })}

      {/* Paths */}
      {paths.map((p) => (
        <Path key={`path-${p.id}`} d={p.d} stroke={VEHICLE_FILL[scene.vehicles.find((v) => v.id === p.id)?.color ?? ''] ?? '#fff'} strokeWidth={0.8} strokeDasharray="2 1.5" fill="none" opacity={0.8} />
      ))}

      {/* Pedestrians */}
      {(scene.pedestrians ?? []).map((p, i) => {
        const a = approachPoint(p.crossing, ROAD_HALF + 2.5);
        return <Circle key={`ped-${i}`} cx={a.x - LANE} cy={a.y} r={1.3} fill="#f97316" />;
      })}

      {/* Vehicles: trams first so cars draw on top */}
      {[...scene.vehicles]
        .sort((a, b) => (a.kind === 'tram' ? -1 : 0) - (b.kind === 'tram' ? -1 : 0))
        .filter((v) => !hidden.includes(v.id))
        .map((v) => (
          <Vehicle key={v.id} v={v} pose={poses?.[v.id] ?? restingPoses[v.id]} glow={highlight.includes(v.id)} />
        ))}
    </Svg>
  );
};
