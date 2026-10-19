import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { COLORS } from '../theme/colors';
import { RADIUS, SHADOW, TYPE } from '../theme/tokens';

type PlanadoLoaderProps = {
  message?: string;
  compact?: boolean;
  fullScreen?: boolean;
};

const breathe = css.keyframes({
  from: { transform: [{ scale: 1 }] },
  to: { transform: [{ scale: 1.045 }] },
});

const blink = css.keyframes({
  '0%': { opacity: 0.25, transform: [{ translateY: 0 }] },
  '50%': { opacity: 1, transform: [{ translateY: -3 }] },
  '100%': { opacity: 0.25, transform: [{ translateY: 0 }] },
});

const motion = css.create({
  breathe: {
    animationName: breathe,
    animationDuration: '1.3s',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  dot: {
    animationName: blink,
    animationDuration: '1.1s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

const DOT_DELAYS = ['0ms', '160ms', '320ms'] as const;

export function PlanadoLoader({
  message = 'Loading your plans...',
  compact = false,
  fullScreen = false,
}: PlanadoLoaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <View
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={[styles.container, fullScreen && styles.fullScreen, compact && styles.compact]}
    >
      <Animated.View
        style={[styles.logoSurface, compact && styles.logoSurfaceCompact, !reduceMotion && motion.breathe]}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={require('../assets/images/planado-logo.png')}
          style={[styles.logo, compact && styles.logoCompact]}
        />
      </Animated.View>
      {!compact ? <Text style={styles.brand}>Planado</Text> : null}
      <View style={[styles.dots, compact && styles.dotsCompact]}>
        {DOT_DELAYS.map((delay) => (
          <Animated.View
            key={delay}
            style={[styles.dot, !reduceMotion && motion.dot, !reduceMotion && { animationDelay: delay }]}
          />
        ))}
      </View>
      <Text style={[styles.message, compact && styles.messageCompact]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'transparent',
  },
  fullScreen: {
    flex: 1,
    minHeight: undefined,
    backgroundColor: COLORS.background,
  },
  compact: {
    minHeight: 140,
    padding: 16,
  },
  logoSurface: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.xxl,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.md,
  },
  logoSurfaceCompact: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    boxShadow: SHADOW.sm,
  },
  logo: { width: 66, height: 66 },
  logoCompact: { width: 40, height: 40 },
  brand: {
    width: '100%',
    ...TYPE.title2,
    marginTop: 16,
    color: COLORS.ink,
    fontWeight: '800',
    textAlign: 'center',
  },
  dots: { height: 14, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dotsCompact: { marginTop: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  message: { width: '100%', ...TYPE.callout, marginTop: 10, color: COLORS.muted, fontWeight: '400', textAlign: 'center' },
  messageCompact: { ...TYPE.subhead, marginTop: 8 },
});
