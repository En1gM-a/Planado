import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { type ColorValue, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { COLORS } from '../../theme/colors';
import { HIT, ON_PRIMARY, RADIUS } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Square 44px icon button. `label` is required: it is the screen-reader name. */
export function IconButton({
  badge,
  children,
  color = COLORS.ink,
  disabled,
  icon,
  label,
  onPress,
  size = 21,
  style,
  tone = 'surface',
}: {
  badge?: number;
  children?: ReactNode;
  color?: ColorValue;
  disabled?: boolean;
  icon?: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'soft' | 'ghost';
}) {
  return (
    <PressableScale
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      scaleTo={0.92}
      style={[styles.button, tone === 'soft' && styles.soft, tone === 'ghost' && styles.ghost, disabled && styles.disabled, style]}
    >
      {children ?? (icon ? <Ionicons color={color} name={icon} size={size} /> : null)}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  soft: { borderColor: 'transparent', backgroundColor: COLORS.primarySoft },
  ghost: { borderColor: 'transparent', backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
    borderRadius: 10,
    backgroundColor: COLORS.red,
  },
  badgeText: { color: ON_PRIMARY, fontSize: 12, lineHeight: 14, fontWeight: '800' },
});
