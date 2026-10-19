import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { COLORS } from '../../theme/colors';
import { TYPE } from '../../theme/tokens';
import { IconButton } from './IconButton';
import { Reveal } from './Reveal';

/** Large title used at the top of each tab: small eyebrow, big title, actions. */
export function PageHeader({
  actions,
  eyebrow,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <Reveal style={styles.pageHeader}>
      <View style={styles.pageHeaderCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </Reveal>
  );
}

/** Compact bar for pushed screens: back button, centered title, optional action. */
export function TopBar({
  eyebrow,
  onBack,
  right,
  title,
}: {
  eyebrow?: string;
  onBack: () => void;
  right?: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.topBar}>
      <IconButton icon="arrow-back" label="Go back" onPress={onBack} />
      <View style={styles.topBarCopy}>
        {eyebrow ? <Text numberOfLines={1} style={styles.topBarEyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" numberOfLines={1} style={styles.topBarTitle}>{title}</Text>
      </View>
      {right ?? <View style={styles.topBarSpacer} />}
    </View>
  );
}

/** Section title with optional supporting line and a trailing text action. */
export function SectionHeader({
  actionLabel,
  onAction,
  style,
  subtitle,
  title,
}: {
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionCopy}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction} style={styles.sectionAction}>
          <Text numberOfLines={1} style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons color={COLORS.primary} name="chevron-forward" size={15} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  pageHeaderCopy: { flex: 1 },
  eyebrow: { ...TYPE.overline, color: COLORS.primary },
  pageTitle: { ...TYPE.title1, marginTop: 4, color: COLORS.ink },
  pageSubtitle: { ...TYPE.callout, marginTop: 4, color: COLORS.muted, fontWeight: '400' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  topBarCopy: { flex: 1, alignItems: 'center' },
  topBarEyebrow: { ...TYPE.overline, color: COLORS.primary },
  topBarTitle: { width: '100%', ...TYPE.headline, color: COLORS.ink, textAlign: 'center' },
  topBarSpacer: { width: 44 },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionCopy: { flex: 1 },
  sectionTitle: { ...TYPE.title3, color: COLORS.ink },
  sectionSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  sectionAction: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { ...TYPE.subhead, color: COLORS.primary, fontWeight: '700' },
});
