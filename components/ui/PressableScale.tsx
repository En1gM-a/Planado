import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { MOTION } from '../../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Large cards read better with a gentler value. */
  scaleTo?: number;
};

/**
 * Pressable with a tactile shrink on touch. The animation runs entirely on the
 * UI thread, so it never waits on JavaScript or re-renders the tree.
 */
export function PressableScale({
  accessibilityRole = 'button',
  children,
  onPressIn,
  onPressOut,
  scaleTo = MOTION.pressScale,
  style,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  // The press dim scales the style's own opacity, so disabled styles still show.
  const flatOpacity = StyleSheet.flatten(style)?.opacity;
  const baseOpacity = typeof flatOpacity === 'number' ? flatOpacity : 1;

  const animatedStyle = useAnimatedStyle(() => {
    const progress = pressed.get();
    return {
      opacity: baseOpacity * (1 - progress * 0.1),
      transform: [{ scale: 1 - progress * (1 - scaleTo) }],
    };
  });

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={accessibilityRole}
      onPressIn={(event) => {
        pressed.set(withTiming(1, { duration: MOTION.fast, easing: MOTION.easeOut }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.set(withSpring(0, MOTION.spring));
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
