import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatePresence, MotiView } from 'moti';
import { type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { COLORS } from '../../theme/colors';
import { MOTION, RADIUS, TYPE } from '../../theme/tokens';
import { useAnimateOnMount } from './motion';

type BannerTone = 'error' | 'success' | 'info' | 'warning';

const TONES = {
  error: { icon: 'alert-circle' as const, color: COLORS.red, background: COLORS.redSoft },
  success: { icon: 'checkmark-circle' as const, color: COLORS.green, background: COLORS.greenSoft },
  info: { icon: 'information-circle' as const, color: COLORS.primary, background: COLORS.primarySoft },
  warning: { icon: 'warning' as const, color: COLORS.orange, background: COLORS.orangeSoft },
};

type BannerProps = {
  action?: ReactNode;
  message: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  title?: string;
  tone?: BannerTone;
};

/**
 * Inline status message that slides in when `message` is set and out when it
 * clears. Errors are announced to screen readers as they appear.
 */
export function Banner({ message, ...props }: BannerProps) {
  return (
    <AnimatePresence>
      {message ? <BannerBody key="banner" message={message} {...props} /> : null}
    </AnimatePresence>
  );
}

function BannerBody({ action, message, style, title, tone = 'error' }: BannerProps & { message: string }) {
  const animateIn = useAnimateOnMount();
  const appearance = TONES[tone];

  return (
    <MotiView
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      exit={{ opacity: 0, translateY: -6, scale: 0.98 }}
      exitTransition={{ type: 'timing', duration: MOTION.fast }}
      from={animateIn ? { opacity: 0, translateY: -8, scale: 0.98 } : undefined}
      style={[styles.banner, { backgroundColor: appearance.background }, style]}
      transition={{ type: 'timing', duration: MOTION.base, easing: MOTION.easeOut }}
    >
      <Ionicons color={appearance.color} name={appearance.icon} size={20} />
      <View style={styles.copy}>
        {title ? <Text style={[styles.title, { color: appearance.color }]}>{title}</Text> : null}
        <Text style={[styles.message, { color: appearance.color }]}>{message}</Text>
      </View>
      {action}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.md,
  },
  copy: { flex: 1, gap: 2 },
  title: { ...TYPE.subhead, fontWeight: '700' },
  message: { ...TYPE.subhead },
});
