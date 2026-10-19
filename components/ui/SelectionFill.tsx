import { type ColorValue, View } from 'react-native';

import { COLORS } from '../../theme/colors';

/**
 * Rounded fill (or ring) for a selected or "today" day/hour/period. Android drops
 * the corner radius when the first background or border is added to a rounded
 * view that is already mounted, so these states mount a fresh layer instead.
 */
export function SelectionFill({
  color = COLORS.primary,
  radius,
  variant = 'fill',
}: {
  color?: ColorValue;
  radius: number;
  variant?: 'fill' | 'ring';
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius },
        variant === 'fill' ? { backgroundColor: color } : { borderWidth: 1.5, borderColor: color },
      ]}
    />
  );
}
