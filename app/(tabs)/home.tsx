import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoLoader } from '../../components/PlanadoLoader';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';
import { getMyProfile } from '../../services/authService';
import { getMyUnreadNotificationCount } from '../../services/notificationService';
import { supabase } from '../../services/supabase';

type Profile = {
  display_name?: string | null;
  avatar_url?: string | null;
  timezone?: string | null;
};

type Group = {
  id: string;
  name: string;
  image_url: string | null;
  color: string;
};

type Event = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  is_important: boolean;
  color: string | null;
  location: string | null;
  group_name: string;
};

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatEventTime(event: Event) {
  if (event.is_all_day) return 'All day';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(event.start_time));
}

function formatEventDay(dateValue: string) {
  const date = new Date(dateValue);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'TODAY';
  if (date.toDateString() === tomorrow.toDateString()) return 'TOMORROW';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  })
    .format(date)
    .toUpperCase();
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!user) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [profileData, membershipResult, eventResult, notificationResult] =
        await Promise.all([
          getMyProfile(),
          supabase
            .from('group_members')
            .select('color, groups(id, name, image_url)')
            .eq('user_id', user.id)
            .limit(8),
          supabase
            .from('events')
            .select('id, title, start_time, end_time, is_all_day, is_important, color, location, groups(name)')
            .eq('status', 'active')
            .gte('end_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(5),
          getMyUnreadNotificationCount(),
        ]);

      const firstError = [membershipResult, eventResult]
        .map((result) => result.error)
        .find(Boolean);
      if (firstError) throw firstError;

      const mappedGroups = (membershipResult.data ?? []).flatMap((membership) => {
        const related = firstRelated(membership.groups as unknown as {
          id: string;
          name: string;
          image_url: string | null;
        });
        return related
          ? [{ ...related, color: membership.color ?? COLORS.primary }]
          : [];
      });

      const mappedEvents = (eventResult.data ?? []).map((event) => {
        const related = firstRelated(event.groups as unknown as { name: string });
        return {
          id: event.id,
          title: event.title,
          start_time: event.start_time,
          end_time: event.end_time,
          is_all_day: event.is_all_day,
          is_important: event.is_important,
          color: event.color,
          location: event.location,
          group_name: related?.name ?? 'Personal plan',
        };
      });

      setProfile(profileData as Profile | null);
      setGroups(mappedGroups);
      setEvents(mappedEvents);
      setUnreadCount(notificationResult);
    } catch (loadError) {
      console.error('Could not load Home dashboard:', loadError);
      setError('Some plans could not be loaded. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 5 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      return {
        key: date.toISOString(),
        label: index === 0 ? 'Today' : new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date),
        number: date.getDate(),
        active: index === 0,
      };
    });
  }, []);

  const displayName =
    profile?.display_name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split('@')[0] ??
    'friend';
  const firstName = displayName.trim().split(/\s+/)[0];
  const avatar = profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? null;
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[COLORS.primary]}
            onRefresh={() => void loadDashboard(true)}
            refreshing={refreshing}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.date}>{dateLabel.toUpperCase()}</Text>
              <Text style={styles.greeting}>Good to see you, {firstName}.</Text>
            </View>

            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel="Notifications"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.push('/notifications' as Href)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color={COLORS.ink} name="notifications-outline" size={20} />
                {unreadCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                accessibilityLabel="Open profile"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.push('/(tabs)/profile' as Href)}
                style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.dayStrip}>
            {days.map((day) => (
              <View key={day.key} style={[styles.day, day.active && styles.dayActive]}>
                <Text style={[styles.dayLabel, day.active && styles.dayLabelActive]}>{day.label}</Text>
                <Text style={[styles.dayNumber, day.active && styles.dayNumberActive]}>{day.number}</Text>
                {day.active ? <View style={styles.dayDot} /> : null}
              </View>
            ))}
          </View>

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

          <View style={styles.aiCard}>
            <View style={styles.aiGlowOne} />
            <View style={styles.aiGlowTwo} />
            <View style={styles.aiTopRow}>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeMark}>✦</Text>
                <Text style={styles.aiBadgeText}>PLANADO BRIEF</Text>
              </View>
              <Text style={styles.aiTime}>FUTURE UPDATE</Text>
            </View>
            <Text style={styles.aiTitle}>AI Brief is coming soon</Text>
            <Text style={styles.aiBody} numberOfLines={4}>
              A future Planado update will summarize group changes, upcoming plans, and the items that need your attention.
            </Text>
            <View style={styles.aiFooter}>
              <Ionicons color="#ABABD0" name="time-outline" size={13} />
              <Text style={styles.aiFooterText}>Preview only · No summaries are generated yet</Text>
            </View>
          </View>

          <View style={styles.quickRow}>
            <Pressable
              onPress={() => router.push('/event/create' as Href)}
              style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
            >
              <View style={styles.primaryActionIcon}><Text style={styles.plus}>＋</Text></View>
              <View style={styles.actionCopy}>
                <Text style={styles.primaryActionTitle}>Create event</Text>
                <Text style={styles.primaryActionMeta}>Plan something together</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/(tabs)/groups', params: { open: 'join' } } as Href)}
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
            >
              <Text style={styles.joinIcon}>⌁</Text>
              <Text style={styles.secondaryActionTitle}>Join group</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Coming up</Text>
              <Text style={styles.sectionSubtitle}>Your next shared moments</Text>
            </View>
            {events.length > 0 ? (
              <Pressable hitSlop={8} onPress={() => router.push('/(tabs)/calendar' as Href)}>
                <Text style={styles.seeAll}>See calendar</Text>
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.loadingCard}>
              <PlanadoLoader compact message="Gathering your plans..." />
            </View>
          ) : events.length > 0 ? (
            <View style={styles.eventList}>
              {events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/event/${event.id}` as Href)}
                  style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
                >
                  <View style={[styles.eventAccent, { backgroundColor: event.color ?? COLORS.primary }]} />
                  <View style={styles.eventDateBlock}>
                    <Text style={styles.eventDay}>{formatEventDay(event.start_time)}</Text>
                    <Text style={styles.eventTime}>{formatEventTime(event)}</Text>
                  </View>
                  <View style={styles.eventContent}>
                    <View style={styles.eventTitleRow}>
                      <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                      {event.is_important ? <Ionicons color={COLORS.orange} name="star" size={12} /> : null}
                    </View>
                    <Text numberOfLines={1} style={styles.eventMeta}>
                      {event.group_name}{event.location ? `  ·  ${event.location}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIllustration}>
                <View style={styles.emptyCalendarTop} />
                <Text style={styles.emptyCalendarMark}>＋</Text>
              </View>
              <View style={styles.emptyCopy}>
                <Text style={styles.emptyTitle}>Your week is wide open</Text>
                <Text style={styles.emptyBody}>Create an event or join a group to start filling your shared calendar.</Text>
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Your groups</Text>
              <Text style={styles.sectionSubtitle}>{groups.length ? `${groups.length} active circle${groups.length === 1 ? '' : 's'}` : 'The people you plan with'}</Text>
            </View>
            {groups.length > 0 ? (
              <Pressable hitSlop={8} onPress={() => router.push('/(tabs)/groups' as Href)}>
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            ) : null}
          </View>

          {groups.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupRow}>
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  onPress={() => router.push(`/group/${group.id}` as Href)}
                  style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}
                >
                  <View style={[styles.groupArt, { backgroundColor: `${group.color}20` }]}>
                    {group.image_url ? (
                      <Image source={{ uri: group.image_url }} style={styles.groupImage} />
                    ) : (
                      <Text style={[styles.groupInitial, { color: group.color }]}>{group.name.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text numberOfLines={1} style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.groupStatus}>Active now</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Pressable
              onPress={() => router.push({ pathname: '/(tabs)/groups', params: { open: 'create' } } as Href)}
              style={({ pressed }) => [styles.createGroupCard, pressed && styles.pressed]}
            >
              <View style={styles.createGroupIcon}><Text style={styles.createGroupPlus}>＋</Text></View>
              <View style={styles.createGroupCopy}>
                <Text style={styles.createGroupTitle}>Create your first group</Text>
                <Text style={styles.createGroupBody}>Bring friends, family, or teammates into one shared plan.</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 34 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  headerCopy: { flex: 1 },
  date: { color: COLORS.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.15 },
  greeting: { marginTop: 6, color: COLORS.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, backgroundColor: COLORS.surface },
  notificationBadge: { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.background, borderRadius: 9, backgroundColor: '#F26767' },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  avatar: { width: 44, height: 44, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface, borderRadius: 16, backgroundColor: COLORS.primarySoft, shadowColor: '#34344E', shadowOpacity: 0.13, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: COLORS.primary, fontSize: 18, fontWeight: '900' },
  dayStrip: { marginTop: 23, padding: 5, flexDirection: 'row', borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  day: { flex: 1, minHeight: 61, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  dayActive: { backgroundColor: COLORS.primary },
  dayLabel: { color: COLORS.faint, fontSize: 9, fontWeight: '700' },
  dayLabelActive: { color: '#DCDCFF' },
  dayNumber: { marginTop: 4, color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  dayNumberActive: { color: '#FFFFFF' },
  dayDot: { width: 4, height: 4, marginTop: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
  errorBanner: { marginTop: 12, padding: 11, color: COLORS.red, fontSize: 11, lineHeight: 16, borderRadius: 12, backgroundColor: COLORS.redSoft },
  aiCard: { minHeight: 190, marginTop: 17, padding: 20, overflow: 'hidden', borderRadius: 26, backgroundColor: '#24244E' },
  aiGlowOne: { position: 'absolute', width: 180, height: 180, top: -95, right: -50, borderRadius: 90, backgroundColor: '#696BD8', opacity: 0.5 },
  aiGlowTwo: { position: 'absolute', width: 120, height: 120, bottom: -78, left: 24, borderRadius: 60, backgroundColor: '#4CACE0', opacity: 0.2 },
  aiTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiBadgeMark: { color: '#BFC0FF', fontSize: 17 },
  aiBadgeText: { color: '#D9D9FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  aiTime: { color: '#A9A9CF', fontSize: 9, fontWeight: '700' },
  aiTitle: { maxWidth: 460, marginTop: 22, color: '#FFFFFF', fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.5 },
  aiBody: { maxWidth: 570, marginTop: 8, color: '#C6C6E2', fontSize: 12, lineHeight: 18 },
  aiFooter: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiFooterText: { color: '#ABABD0', fontSize: 9, fontWeight: '600' },
  quickRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  primaryAction: { flex: 1.6, minHeight: 72, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 20, backgroundColor: COLORS.primary },
  primaryActionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.16)' },
  plus: { color: '#FFFFFF', fontSize: 24, lineHeight: 27 },
  actionCopy: { flex: 1 },
  primaryActionTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  primaryActionMeta: { marginTop: 3, color: '#DADAFF', fontSize: 9 },
  secondaryAction: { flex: 1, minHeight: 72, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  joinIcon: { color: COLORS.primary, fontSize: 20, fontWeight: '900' },
  secondaryActionTitle: { marginTop: 4, color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  sectionHeader: { marginTop: 27, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.35 },
  sectionSubtitle: { marginTop: 3, color: COLORS.faint, fontSize: 9 },
  seeAll: { color: COLORS.primary, fontSize: 10, fontWeight: '800' },
  loadingCard: { minHeight: 126, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  loadingText: { color: COLORS.muted, fontSize: 11 },
  eventList: { gap: 9 },
  eventCard: { minHeight: 77, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  eventAccent: { alignSelf: 'stretch', width: 5 },
  eventDateBlock: { width: 84, paddingHorizontal: 13 },
  eventDay: { color: COLORS.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  eventTime: { marginTop: 4, color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  eventContent: { flex: 1, paddingVertical: 14 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eventTitle: { flexShrink: 1, color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  eventMeta: { marginTop: 5, color: COLORS.muted, fontSize: 9 },
  chevron: { paddingHorizontal: 16, color: COLORS.faint, fontSize: 25, fontWeight: '300' },
  emptyCard: { minHeight: 134, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 17, borderWidth: 1, borderColor: COLORS.line, borderRadius: 23, backgroundColor: COLORS.surface },
  emptyIllustration: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: COLORS.primarySoft },
  emptyCalendarTop: { position: 'absolute', top: 16, width: 39, height: 7, borderRadius: 5, backgroundColor: '#BFC0F7' },
  emptyCalendarMark: { marginTop: 11, color: COLORS.primary, fontSize: 26 },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  emptyBody: { marginTop: 6, color: COLORS.muted, fontSize: 10, lineHeight: 16 },
  groupRow: { gap: 10, paddingRight: 8 },
  groupCard: { width: 132, padding: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 21, backgroundColor: COLORS.surface },
  groupArt: { height: 84, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  groupImage: { width: '100%', height: '100%' },
  groupInitial: { fontSize: 30, fontWeight: '900' },
  groupName: { marginTop: 10, color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  groupStatus: { marginTop: 3, color: COLORS.green, fontSize: 8, fontWeight: '700' },
  createGroupCard: { minHeight: 88, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  createGroupIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: COLORS.greenSoft },
  createGroupPlus: { color: COLORS.green, fontSize: 25 },
  createGroupCopy: { flex: 1 },
  createGroupTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  createGroupBody: { marginTop: 4, color: COLORS.muted, fontSize: 9, lineHeight: 14 },
});
