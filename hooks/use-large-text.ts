import { useWindowDimensions } from 'react-native';

/**
 * True when the system font scale is large enough that side-by-side
 * label/value rows would clip and should stack vertically instead.
 *
 * fontScale ≈ 1.0 at the default Dynamic Type size and rises with the
 * Larger Text setting (~1.35 at XXXL, ~2.7+ at the largest accessibility
 * sizes). 1.35 keeps the compact two-column layout for normal sizes and
 * only reflows once columns genuinely stop fitting.
 */
export function useLargeText(threshold = 1.35): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale >= threshold;
}
