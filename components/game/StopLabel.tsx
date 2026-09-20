import { Path } from 'react-native-svg';
import { STOP_LABEL_PATHS } from './stopLabelPaths';

/** Fixed system-bold outlines: no font lookup or shaping when a road repaints. */
export function StopLabel({ x, y, variant, fill }: { x: number; y: number; variant: keyof typeof STOP_LABEL_PATHS; fill: string }) {
  return <Path d={STOP_LABEL_PATHS[variant]} transform={`translate(${x} ${y})`} fill={fill} />;
}
