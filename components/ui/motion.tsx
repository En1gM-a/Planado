import { MotiView } from 'moti';
import { type ReactNode, useState } from 'react';
import { AppState, type StyleProp, type ViewStyle } from 'react-native';

import { MOTION } from '../../theme/tokens';

/**
 * Whether a component should play its entrance animation. Decided once, at mount:
 * Reanimated cannot apply frames while the app is in the background (for example
 * behind Android's "Add widget" sheet), so content mounted then would stay at its
 * starting values. It renders in its final state instead.
 */
export function useAnimateOnMount() {
  const [animate] = useState(() => AppState.currentState === 'active');
  return animate;
}

/**
 * Card inside a native <Modal>. The modal's own fade handles opacity, so the card
 * only adds a small spring scale and can never be left invisible.
 */
export function ModalCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const animateIn = useAnimateOnMount();

  return (
    <MotiView
      accessibilityViewIsModal
      animate={{ scale: 1 }}
      from={animateIn ? { scale: 0.95 } : undefined}
      style={style}
      transition={{ type: 'spring', ...MOTION.spring }}
    >
      {children}
    </MotiView>
  );
}
