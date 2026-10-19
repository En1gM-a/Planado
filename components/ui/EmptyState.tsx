import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { type ColorValue, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { COLORS } from '../../theme/colors';
import { RADIUS, TYPE } from '../../theme/tokens';
import { Reveal } from './Reveal';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Friendly placeholder for empty lists, with room for follow-up actions. */
export function EmptyState({
  background = COLORS.primarySoft,
  body,
  children,
  color = COLORS.primary,
  compact,
  icon,
  style,
  title,
}: {
  background?: ColorValue;
  body: string;
  children?: ReactNode;
  color?: ColorValue;
  compact?: boolean;
  icon: IconName;
  style?: StyleProp<ViewStyle>;
  title: string;
}) {
  return (
    <Reveal style={[styles.card, compact && styles.cardCompact, style]}>
      <View style={[styles.icon, compact && styles.iconCompact, { backgroundColor: background }]}>
        <Ionicons color={color} name={icon} size={compact ? 24 : 30} />
      </View>
      <View style={compact ? styles.copyCompact : styles.copy}>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <Text style={[styles.body, compact && styles.bodyCompact]}>{body}</Text>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </Reveal>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  cardCompact: { paddingVertical: 18, paddingHorizontal: 16, flexDirection: 'row', gap: 14 },
  icon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg },
  iconCompact: { width: 52, height: 52, borderRadius: RADIUS.md },
  copy: { marginTop: 16, alignSelf: 'stretch', alignItems: 'center' },
  copyCompact: { flex: 1 },
  title: { width: '100%', ...TYPE.headline, color: COLORS.ink, textAlign: 'center' },
  titleCompact: { textAlign: 'left' },
  body: { width: '100%', ...TYPE.callout, maxWidth: 340, marginTop: 6, color: COLORS.muted, fontWeight: '400', textAlign: 'center' },
  bodyCompact: { marginTop: 3, textAlign: 'left' },
  actions: { marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
});
