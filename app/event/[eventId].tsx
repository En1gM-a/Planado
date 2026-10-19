import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoLoader } from '../../components/PlanadoLoader';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/ui/Headers';
import { IconButton } from '../../components/ui/IconButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { Reveal } from '../../components/ui/Reveal';
import { useAuth } from '../../hooks/useAuth';
import { getCalendarEventById, type CalendarEvent } from '../../services/eventService';
import { COLORS } from '../../theme/colors';
import { gradientStyle, PAGE, RADIUS, SHADOW, tint, TYPE } from '../../theme/tokens';

const HERO_SHEEN = 'radial-gradient(circle at 92% 0%, rgba(255, 255, 255, 0.32) 0%, rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, rgba(10, 10, 30, 0) 20%, rgba(10, 10, 30, 0.34) 100%)';

function formatRange(event: CalendarEvent) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(start);
  if (event.is_all_day) return `${date} · All day`;
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time.format(start)} – ${time.format(end)}`;
}

function retentionDescription(event: CalendarEvent) {
  if (event.retention_policy === 'permanent') return 'Kept in your calendar history';
  if (!event.delete_after) return 'Scheduled for automatic cleanup';
  const deletionDate = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(event.delete_after));
  return event.retention_policy === 'class_schedule'
    ? `Class schedule · deletes after ${deletionDate}`
    : `Temporary · deletes after ${deletionDate}`;
}

function importantDescription(event: CalendarEvent) {
  const now = new Date();
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  if (end.getTime() < now.getTime()) return 'Important event ended';
  if (start.getTime() <= now.getTime()) return 'Important · Happening now';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days = Math.round((eventDay.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return 'Important · Today';
  return `Important · ${days} day${days === 1 ? '' : 's'} left`;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    if (!eventId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const nextEvent = await getCalendarEventById(eventId);
      setEvent(nextEvent);
      setCompleted(new Date(nextEvent.end_time).getTime() < Date.now());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'This event could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [eventId, user]);

  useFocusEffect(useCallback(() => { void loadEvent(); }, [loadEvent]));

  if (!authLoading && !user) return <Redirect href="/login" />;
  if (authLoading || loading) return <SafeAreaView style={styles.safeArea}><PlanadoLoader fullScreen message="Opening event..." /></SafeAreaView>;

  if (!event) return (
    <SafeAreaView style={styles.safeArea}>
      <Reveal style={styles.center}>
        <View style={styles.errorIcon}><Ionicons color={COLORS.red} name="calendar-clear-outline" size={32} /></View>
        <Text accessibilityRole="header" style={styles.errorTitle}>Event unavailable</Text>
        <Text style={styles.centerText}>{error ?? 'It may have been removed or you may not have access.'}</Text>
        <Button
          icon="calendar-outline"
          label="Back to calendar"
          onPress={() => router.replace('/(tabs)/calendar' as Href)}
          size="md"
          style={styles.centerButton}
        />
      </Reveal>
    </SafeAreaView>
  );

  const accent = event.color ?? COLORS.primary;
  const accentHex = event.color ?? '#5B5CE2';
  const accentSoft = tint(accentHex, 0.14);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <TopBar
            onBack={() => router.back()}
            right={(
              <IconButton
                color={COLORS.primary}
                icon="calendar-outline"
                label="Open calendar"
                onPress={() => router.push('/(tabs)/calendar' as Href)}
              />
            )}
            title="Event details"
          />

          <Reveal style={[styles.hero, gradientStyle(HERO_SHEEN, accent)]}>
            <View style={styles.heroIcon}><Ionicons color={accent} name="calendar" size={28} /></View>
            <Text style={styles.category}>{event.category}</Text>
            <Text accessibilityRole="header" style={styles.title}>{event.title}</Text>
            <Text style={styles.heroMeta}>{event.group_name}</Text>
            {event.is_important || completed ? (
              <View style={styles.badgeRow}>
                {event.is_important ? (
                  <View style={styles.heroBadge}>
                    <Ionicons color="#FFE3A8" name="star" size={14} />
                    <Text numberOfLines={1} style={styles.heroBadgeText}>{importantDescription(event)}</Text>
                  </View>
                ) : null}
                {completed ? (
                  <View style={styles.heroBadge}>
                    <Ionicons color="#FFFFFF" name="checkmark-circle" size={14} />
                    <Text numberOfLines={1} style={styles.heroBadgeText}>Completed</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Reveal>

          <Reveal index={1} style={styles.detailCard}>
            <DetailRow background={accentSoft} color={accent} icon="time-outline" label="When" value={formatRange(event)} />
            <View style={styles.separator} />
            <DetailRow background={accentSoft} color={accent} icon="people-outline" label="Group" value={event.group_name} />
            <View style={styles.separator} />
            <DetailRow background={accentSoft} color={accent} icon="location-outline" label="Location" value={event.location || 'No location added'} />
            <View style={styles.separator} />
            <DetailRow
              background={accentSoft}
              color={accent}
              icon={event.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'}
              label="Visibility"
              value={event.visibility === 'private' ? 'Only visible to you' : 'Visible to group members'}
            />
            <View style={styles.separator} />
            <DetailRow
              background={accentSoft}
              color={accent}
              icon={event.retention_policy === 'permanent' ? 'archive-outline' : 'timer-outline'}
              label="Retention"
              value={retentionDescription(event)}
            />
            {event.is_important ? (
              <>
                <View style={styles.separator} />
                <DetailRow
                  background={COLORS.orangeSoft}
                  color={COLORS.orange}
                  icon="star-outline"
                  label="Priority"
                  value="Pinned in this group's widget until it ends"
                />
              </>
            ) : null}
          </Reveal>

          <Reveal index={2}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>About this event</Text>
            <View style={styles.descriptionCard}>
              <Text style={event.description ? styles.description : styles.descriptionEmpty}>
                {event.description || 'No additional notes were added.'}
              </Text>
            </View>
          </Reveal>

          <Reveal index={3}>
            <PressableScale
              accessibilityLabel={`Open ${event.group_name}`}
              onPress={() => router.push(`/group/${event.group_id}` as Href)}
              scaleTo={0.98}
              style={styles.groupButton}
            >
              <View style={styles.groupButtonIcon}>
                <Ionicons color={COLORS.primary} name="people" size={21} />
              </View>
              <View style={styles.groupButtonCopy}>
                <Text numberOfLines={1} style={styles.groupButtonTitle}>Open {event.group_name}</Text>
                <Text style={styles.groupButtonBody}>View members and upcoming plans</Text>
              </View>
              <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
            </PressableScale>
          </Reveal>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  background,
  color,
  icon,
  label,
  value,
}: {
  background: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: background }]}>
        <Ionicons color={color} name={icon} size={19} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 40 },
  page: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter },
  center: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  centerText: { width: '100%', ...TYPE.body, maxWidth: 340, marginTop: 8, color: COLORS.muted, textAlign: 'center' },
  centerButton: { marginTop: 22 },
  errorIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.xl, backgroundColor: COLORS.redSoft },
  errorTitle: { width: '100%', ...TYPE.title3, marginTop: 18, color: COLORS.ink, textAlign: 'center' },
  hero: {
    minHeight: 236,
    marginTop: 4,
    padding: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.xxl,
    boxShadow: SHADOW.md,
  },
  heroIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg, backgroundColor: '#FFFFFF' },
  category: { width: '100%', ...TYPE.overline, marginTop: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  title: { width: '100%', ...TYPE.title1, maxWidth: 500, marginTop: 4, color: '#FFFFFF', textAlign: 'center' },
  heroMeta: { width: '100%', ...TYPE.callout, marginTop: 6, color: 'rgba(255,255,255,0.92)', textAlign: 'center' },
  badgeRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  heroBadge: {
    minHeight: 30,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(10,10,30,0.24)',
  },
  heroBadgeText: { ...TYPE.footnote, color: '#FFFFFF', fontWeight: '700' },
  detailCard: {
    marginTop: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  detailRow: { minHeight: 74, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  detailIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm },
  detailCopy: { flex: 1 },
  detailLabel: { ...TYPE.footnote, color: COLORS.muted, fontWeight: '600' },
  detailValue: { ...TYPE.bodyStrong, marginTop: 2, color: COLORS.ink },
  separator: { height: 1, marginLeft: 72, backgroundColor: COLORS.line },
  sectionTitle: { ...TYPE.title3, marginTop: 28, marginBottom: 12, color: COLORS.ink },
  descriptionCard: {
    minHeight: 92,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  description: { ...TYPE.body, color: COLORS.ink },
  descriptionEmpty: { ...TYPE.body, color: COLORS.muted, fontStyle: 'italic' },
  groupButton: {
    minHeight: 76,
    marginTop: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  groupButtonIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft },
  groupButtonCopy: { flex: 1 },
  groupButtonTitle: { ...TYPE.headline, color: COLORS.ink },
  groupButtonBody: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
});
