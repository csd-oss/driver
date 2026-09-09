export interface SceneVehicle {
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

export interface VehiclePose {
  x: number;
  y: number;
  angle: number;
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
