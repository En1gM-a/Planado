import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps } from 'react';
import { ActivityIndicator, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

import { COLORS } from '../../theme/colors';
import { ON_PRIMARY, RADIUS, SHADOW, TYPE } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Variant = 'primary' | 'secondary' | 'soft' | 'danger';
type Size = 'lg' | 'md' | 'sm';

const FOREGROUND: Record<Variant, string> = {
  primary: ON_PRIMARY,
  secondary: COLORS.ink,
  soft: COLORS.primary,
  danger: COLORS.danger,
};

/** The app's one button: consistent sizes, press feedback, and a busy state. */
export function Button({
  accessibilityHint,
  disabled,
  icon,
  label,
  loading,
  onPress,
  size = 'lg',
  style,
  variant = 'primary',
}: {
  accessibilityHint?: string;
  disabled?: boolean;
  icon?: IconName;
  label: string;
  loading?: boolean;
  onPress?: () => void;
  size?: Size;
  style?: StyleProp<ViewStyle>;
  variant?: Variant;
}) {
  const foreground = FOREGROUND[variant];
  const inactive = Boolean(disabled || loading);

  return (
    <PressableScale
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityState={{ busy: Boolean(loading), disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      scaleTo={size === 'lg' ? 0.98 : 0.96}
      style={[
        styles.base,
        styles[size],
        styles[variant],
        variant === 'primary' && !inactive && styles.primaryShadow,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : icon ? (
        <Ionicons color={foreground} name={icon} size={size === 'sm' ? 17 : 19} />
      ) : null}
      <Text numberOfLines={1} style={[styles.label, size === 'sm' && styles.labelSmall, { color: foreground }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  lg: { minHeight: 54, paddingHorizontal: 20, borderRadius: RADIUS.md },
  md: { minHeight: 48, paddingHorizontal: 18, borderRadius: RADIUS.md },
  sm: { minHeight: 44, paddingHorizontal: 14, borderRadius: RADIUS.sm },
  primary: { backgroundColor: COLORS.primary },
  primaryShadow: { boxShadow: SHADOW.primary },
  secondary: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface },
  soft: { backgroundColor: COLORS.primarySoft },
  danger: { backgroundColor: COLORS.redSoft },
  disabled: { opacity: 0.45 },
  label: { ...TYPE.bodyStrong, fontWeight: '700' },
  labelSmall: { ...TYPE.callout, fontWeight: '700' },
});
