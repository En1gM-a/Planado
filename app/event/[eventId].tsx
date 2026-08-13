import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../hooks/useAuth';
import { getCalendarEventById, type CalendarEvent } from '../../services/eventService';

const COLORS = { background: '#F6F6FB', surface: '#FFFFFF', ink: '#202027', muted: '#777782', faint: '#A1A1AC', line: '#E7E7EF', primary: '#5B5CE2', primarySoft: '#EEEEFF', red: '#C9525C', redSoft: '#FFF0F1' };

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
  if (authLoading || loading) return <SafeAreaView style={styles.safeArea}><View style={styles.center}><ActivityIndicator color={COLORS.primary} /><Text style={styles.centerText}>Opening event...</Text></View></SafeAreaView>;

  if (!event) return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.center}>
        <View style={styles.errorIcon}><Ionicons color={COLORS.red} name="calendar-clear-outline" size={30} /></View>
        <Text style={styles.errorTitle}>Event unavailable</Text>
        <Text style={styles.centerText}>{error ?? 'It may have been removed or you may not have access.'}</Text>
        <Pressable onPress={() => router.replace('/(tabs)/calendar' as Href)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Back to calendar</Text></Pressable>
      </View>
    </SafeAreaView>
  );

  const accent = event.color ?? COLORS.primary;
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.page}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.headerButton}><Ionicons color={COLORS.ink} name="arrow-back" size={21} /></Pressable>
            <Text style={styles.headerTitle}>Event details</Text>
            <Pressable onPress={() => router.push('/(tabs)/calendar' as Href)} style={styles.headerButton}><Ionicons color={COLORS.primary} name="calendar-outline" size={20} /></Pressable>
          </View>

          <View style={[styles.hero, { backgroundColor: accent }]}>
            <View style={styles.heroGlow} />
            <View style={styles.heroIcon}><Ionicons color={accent} name="calendar" size={28} /></View>
            {completed ? (
              <View style={styles.completedBadge}>
                <Ionicons color="#FFFFFF" name="checkmark-circle" size={13} />
                <Text style={styles.completedBadgeText}>COMPLETED</Text>
              </View>
            ) : null}
            <Text style={styles.category}>{event.category.toUpperCase()}</Text>
            <Text style={styles.title}>{event.title}</Text>
            <Text style={styles.heroMeta}>{event.group_name}</Text>
          </View>

          <View style={styles.detailCard}>
            <DetailRow icon="time-outline" label="WHEN" value={formatRange(event)} color={accent} />
            <View style={styles.separator} />
            <DetailRow icon="people-outline" label="GROUP" value={event.group_name} color={accent} />
            <View style={styles.separator} />
            <DetailRow icon="location-outline" label="LOCATION" value={event.location || 'No location added'} color={accent} />
            <View style={styles.separator} />
            <DetailRow icon={event.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'} label="VISIBILITY" value={event.visibility === 'private' ? 'Only visible to you' : 'Visible to group members'} color={accent} />
            <View style={styles.separator} />
            <DetailRow icon={event.retention_policy === 'permanent' ? 'archive-outline' : 'timer-outline'} label="RETENTION" value={retentionDescription(event)} color={accent} />
          </View>

          <Text style={styles.sectionTitle}>About this event</Text>
          <View style={styles.descriptionCard}>
            <Text style={event.description ? styles.description : styles.descriptionEmpty}>{event.description || 'No additional notes were added.'}</Text>
          </View>

          <Pressable onPress={() => router.push(`/group/${event.group_id}` as Href)} style={styles.groupButton}>
            <Ionicons color={COLORS.primary} name="people-circle-outline" size={22} />
            <View style={styles.groupButtonCopy}><Text style={styles.groupButtonTitle}>Open {event.group_name}</Text><Text style={styles.groupButtonBody}>View members and upcoming plans</Text></View>
            <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) {
  return <View style={styles.detailRow}><View style={[styles.detailIcon, { backgroundColor: `${color}18` }]}><Ionicons color={color} name={icon} size={19} /></View><View style={styles.detailCopy}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background }, scrollContent: { paddingBottom: 40 }, page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18 },
  center: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 10 }, centerText: { maxWidth: 340, color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  errorIcon: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: COLORS.redSoft }, errorTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  primaryButton: { minHeight: 44, marginTop: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.primary }, primaryButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10 }, headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface }, headerTitle: { flex: 1, color: COLORS.ink, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  hero: { minHeight: 235, padding: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 27 }, heroGlow: { position: 'absolute', width: 210, height: 210, top: -125, right: -55, borderRadius: 105, backgroundColor: 'rgba(255,255,255,0.16)' }, heroIcon: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: '#FFFFFF' }, category: { marginTop: 14, color: 'rgba(255,255,255,0.74)', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, title: { maxWidth: 500, marginTop: 5, color: '#FFFFFF', fontSize: 23, fontWeight: '900', textAlign: 'center' }, heroMeta: { marginTop: 8, color: 'rgba(255,255,255,0.84)', fontSize: 10 },
  completedBadge: { marginTop: 12, minHeight: 27, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.17)' }, completedBadgeText: { color: '#FFFFFF', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  detailCard: { marginTop: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface }, detailRow: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }, detailIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, detailCopy: { flex: 1 }, detailLabel: { color: COLORS.faint, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, detailValue: { marginTop: 4, color: COLORS.ink, fontSize: 10, fontWeight: '800' }, separator: { height: 1, marginLeft: 65, backgroundColor: COLORS.line },
  sectionTitle: { marginTop: 24, marginBottom: 10, color: COLORS.ink, fontSize: 17, fontWeight: '900' }, descriptionCard: { minHeight: 92, padding: 16, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface }, description: { color: COLORS.muted, fontSize: 10, lineHeight: 17 }, descriptionEmpty: { color: COLORS.faint, fontSize: 10, fontStyle: 'italic' },
  groupButton: { minHeight: 72, marginTop: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface }, groupButtonCopy: { flex: 1 }, groupButtonTitle: { color: COLORS.ink, fontSize: 10, fontWeight: '900' }, groupButtonBody: { marginTop: 3, color: COLORS.muted, fontSize: 8 },
});
