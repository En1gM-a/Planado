import { type DimensionValue, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { COLORS } from '../../theme/colors';
import { RADIUS } from '../../theme/tokens';

const pulse = css.keyframes({
  from: { opacity: 1 },
  to: { opacity: 0.42 },
});

const motion = css.create({
  pulse: {
    animationName: pulse,
    animationDuration: '850ms',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** A placeholder block that gently pulses while content loads. */
export function Skeleton({ height = 12, radius = RADIUS.xs, style, width = '100%' }: SkeletonProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: COLORS.elevatedStrong },
        !reduceMotion && motion.pulse,
        style,
      ]}
    />
  );
}

/** Icon tile + two text lines, matching the shape of most list rows. */
export function SkeletonRow({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      <Skeleton height={44} radius={RADIUS.sm} width={44} />
      <View style={styles.lines}>
        <Skeleton height={14} width="62%" />
        <Skeleton height={12} width="38%" />
      </View>
    </View>
  );
}

/** A stack of rows inside a card, announced once to screen readers. */
export function SkeletonList({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.card}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow key={index} style={index > 0 ? styles.divided : undefined} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  row: { minHeight: 76, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  divided: { borderTopWidth: 1, borderTopColor: COLORS.line },
  lines: { flex: 1, gap: 8 },
});
