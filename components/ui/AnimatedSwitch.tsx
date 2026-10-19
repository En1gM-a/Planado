import { useEffect } from 'react';
import { type ColorValue, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { COLORS } from '../../theme/colors';
import { MOTION } from '../../theme/tokens';

const TRACK_WIDTH = 50;
const TRACK_HEIGHT = 30;
const THUMB = 24;
const TRAVEL = TRACK_WIDTH - THUMB - 6;

/**
 * Visual switch. The parent row owns the press and `accessibilityRole="switch"`.
 * The fill cross-fades instead of interpolating colors, so it works with the
 * platform-adaptive palette.
 */
export function AnimatedSwitch({
  activeColor = COLORS.primary,
  value,
}: {
  activeColor?: ColorValue;
  value: boolean;
}) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.set(withSpring(value ? 1 : 0, MOTION.spring));
  }, [progress, value]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: Math.min(progress.get(), 1) }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * TRAVEL }],
  }));

  return (
    <View pointerEvents="none" style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: activeColor }, fillStyle]} />
      <Animated.View style={[styles.thumb, thumbStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    padding: 3,
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: COLORS.line,
  },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: TRACK_HEIGHT / 2 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 3px rgba(17, 17, 40, 0.25)',
  },
});
