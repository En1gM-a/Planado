import { MotiView } from 'moti';
import { type ReactNode } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';

import { MOTION } from '../../theme/tokens';
import { useAnimateOnMount } from './motion';

type RevealProps = {
  children: ReactNode;
  /** Position in a list; each step adds a short stagger. */
  index?: number;
  delay?: number;
  /** Distance in px the content rises while fading in. */
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Fades content up into place once, when it mounts. Moti hands the animation to
 * Reanimated on the UI thread and skips it when the OS "reduce motion" setting
 * is on. The stagger is capped so long lists never feel slow.
 *
 * On web the content renders in place: statically rendered HTML would otherwise
 * stay invisible until the JavaScript bundle hydrates.
 */
export function Reveal({ children, delay = 0, distance = 12, index = 0, style }: RevealProps) {
  const animateIn = useAnimateOnMount();

  if (Platform.OS === 'web') return <View style={style}>{children}</View>;

  return (
    <MotiView
      animate={{ opacity: 1, translateY: 0 }}
      from={animateIn ? { opacity: 0, translateY: distance } : undefined}
      style={style}
      transition={{
        type: 'timing',
        duration: MOTION.slow,
        easing: MOTION.easeOut,
        delay: Math.min(delay + index * MOTION.stagger, MOTION.maxStaggerDelay),
      }}
    >
      {children}
    </MotiView>
  );
}
