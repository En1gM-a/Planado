import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { type ComponentProps, useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { SectionHeader } from '../../components/ui/Headers';
import { IconButton } from '../../components/ui/IconButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { Reveal } from '../../components/ui/Reveal';
import { Skeleton, SkeletonList } from '../../components/ui/Skeleton';
import { useAuth } from '../../hooks/useAuth';
import { getMyProfile } from '../../services/authService';
import { getMyUnreadNotificationCount } from '../../services/notificationService';
import { supabase } from '../../services/supabase';
import { COLORS } from '../../theme/colors';
import {
  GRADIENT,
  gradientStyle,
  ON_PRIMARY,
  PAGE,
  RADIUS,
  SHADOW,
  tint,
  TYPE,
} from '../../theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

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

const DASHBOARD_TIMEOUT_MS = 15_000;
const BRAND_HEX = '#5B5CE2';

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Dashboard request timed out.')), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function sameCalendarDay(left: Date, right: Date) {
  return left.toDateString() === right.toDateString();
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Compact label for the date tile: "Today", "Tomorrow", or "Oct 24". */
function tileDay(dateValue: string) {
  const date = new Date(dateValue);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (sameCalendarDay(date, today)) return 'Today';
  if (sameCalendarDay(date, tomorrow)) return 'Tomorrow';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatEventTime(event: Event) {
  if (event.is_all_day) return 'All day';
  return timeLabel(new Date(event.start_time));
}

function formatEventDay(dateValue: string) {
  const date = new Date(dateValue);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (sameCalendarDay(date, today)) return 'Today';
  if (sameCalendarDay(date, tomorrow)) return 'Tomorrow';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

/** Short, human countdown for the next event: "In 25 min", "Now", "Tomorrow". */
function countdownLabel(event: Event, now: Date) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  if (start <= now && end >= now) return 'Happening now';

  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (minutes < 60) return `In ${Math.max(minutes, 1)} min`;
  if (sameCalendarDay(start, now)) {
    const hours = Math.floor(minutes / 60);
    return `In ${hours}h`;
  }
  const days = Math.round(
    (new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
      - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000,
  );
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function eventWhen(event: Event) {
  const day = formatEventDay(event.start_time);
  if (event.is_all_day) return `${day} · All day`;
  return `${day} · ${timeLabel(new Date(event.start_time))} – ${timeLabel(new Date(event.end_time))}`;
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
  const [now, setNow] = useState(() => new Date());
  const hasLoadedRef = useRef(false);
  const loadRequestRef = useRef(0);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!user) return;
    const requestId = ++loadRequestRef.current;

    if (isRefresh) setRefreshing(true);
    else if (!hasLoadedRef.current) setLoading(true);
    setError(null);

    try {
      const [profileData, membershipResult, eventResult, notificationResult] =
        await withTimeout(
          Promise.all([
            getMyProfile(user.id).catch((profileError) => {
              console.warn('Dashboard profile refresh failed:', profileError);
              return null;
            }),
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
            getMyUnreadNotificationCount(user.id).catch((notificationError) => {
              console.warn('Dashboard notification refresh failed:', notificationError);
              return null;
            }),
          ]),
          DASHBOARD_TIMEOUT_MS,
        );

      if (requestId !== loadRequestRef.current) return;

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
          ? [{ ...related, color: membership.color ?? BRAND_HEX }]
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

      if (profileData) setProfile(profileData as Profile);
      setGroups(mappedGroups);
      setEvents(mappedEvents);
      if (notificationResult !== null) setUnreadCount(notificationResult);
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Could not load Home dashboard:', loadError);
      setError('Planado could not refresh everything. Check your connection and pull down to try again.');
    } finally {
      if (requestId !== loadRequestRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      // Refresh the clock on focus: the greeting, week strip, and countdown
      // stay correct even when this tab has been open since yesterday.
      setNow(new Date());
      void loadDashboard();
      return () => {
        loadRequestRef.current += 1;
      };
    }, [loadDashboard]),
  );

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() + index);
      return {
        key: date.toISOString(),
        label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date),
        number: date.getDate(),
        active: index === 0,
      };
    });
  }, [now]);

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
  }).format(now);
  const nextEvent = events[0] ?? null;
  const laterEvents = events.slice(1);

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
          <Reveal style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.date}>{dateLabel}</Text>
              <Text accessibilityRole="header" style={styles.greeting}>
                {greetingFor(now)},{'\n'}{firstName}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <IconButton
                badge={unreadCount}
                icon="notifications-outline"
                label="Notifications"
                onPress={() => router.push('/notifications' as Href)}
              />
              <PressableScale
                accessibilityLabel="Open profile"
                hitSlop={4}
                onPress={() => router.push('/(tabs)/profile' as Href)}
                scaleTo={0.92}
                style={styles.avatar}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                )}
              </PressableScale>
            </View>
          </Reveal>

          <Reveal index={1} style={styles.dayStrip}>
            {days.map((day) => (
              <View
                accessibilityLabel={day.active ? `Today, ${day.label} ${day.number}` : `${day.label} ${day.number}`}
                key={day.key}
                style={[styles.day, day.active && styles.dayActive]}
              >
                <Text style={[styles.dayLabel, day.active && styles.dayLabelActive]}>{day.label}</Text>
                <Text style={[styles.dayNumber, day.active && styles.dayNumberActive]}>{day.number}</Text>
              </View>
            ))}
          </Reveal>

          <Banner message={error} />

          <Reveal index={2}>
            {loading ? (
              <View style={[styles.hero, styles.heroLoading]}>
                <Skeleton height={14} style={styles.heroSkeletonPill} width={96} />
                <Skeleton height={26} style={styles.heroSkeletonTitle} width="70%" />
                <Skeleton height={14} width="52%" />
              </View>
            ) : nextEvent ? (
              <PressableScale
                accessibilityHint="Opens the event details"
                accessibilityLabel={`Next up: ${nextEvent.title}, ${eventWhen(nextEvent)}`}
                onPress={() => router.push(`/event/${nextEvent.id}` as Href)}
                scaleTo={0.985}
                style={[styles.hero, styles.heroShadow, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}
              >
                <View style={styles.heroTopRow}>
                  <Text numberOfLines={1} style={styles.heroEyebrow}>Next up</Text>
                  <View style={styles.heroPill}>
                    <View style={styles.heroPillDot} />
                    <Text numberOfLines={1} style={styles.heroPillText}>{countdownLabel(nextEvent, now)}</Text>
                  </View>
                </View>
                <View style={styles.heroTitleRow}>
                  <Text numberOfLines={2} style={styles.heroTitle}>{nextEvent.title}</Text>
                  {nextEvent.is_important ? (
                    <Ionicons accessibilityLabel="Important" color="#FFD089" name="star" size={18} />
                  ) : null}
                </View>
                <View style={styles.heroMetaRow}>
                  <Ionicons color="rgba(255,255,255,0.78)" name="time-outline" size={16} />
                  <Text numberOfLines={1} style={styles.heroMeta}>{eventWhen(nextEvent)}</Text>
                </View>
                <View style={styles.heroMetaRow}>
                  <Ionicons color="rgba(255,255,255,0.78)" name="people-outline" size={16} />
                  <Text numberOfLines={1} style={styles.heroMeta}>
                    {nextEvent.group_name}{nextEvent.location ? ` · ${nextEvent.location}` : ''}
                  </Text>
                </View>
                <View style={styles.heroFooter}>
                  <Text numberOfLines={1} style={styles.heroLink}>View details</Text>
                  <Ionicons color="#FFFFFF" name="arrow-forward" size={16} />
                </View>
              </PressableScale>
            ) : (
              <View style={[styles.hero, styles.heroShadow, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
                <View style={styles.heroTopRow}>
                  <Text numberOfLines={1} style={styles.heroEyebrow}>Your week</Text>
                </View>
                <Text style={styles.heroTitle}>Wide open — fill it with something good.</Text>
                <Text style={styles.heroBody}>
                  Create an event or join a group to start your shared calendar.
                </Text>
                <PressableScale
                  onPress={() => router.push('/event/create' as Href)}
                  style={styles.heroButton}
                >
                  <Ionicons color={COLORS.navy} name="add" size={19} />
                  <Text style={styles.heroButtonText}>Create event</Text>
                </PressableScale>
              </View>
            )}
          </Reveal>

          <Reveal index={3} style={styles.quickRow}>
            <QuickAction
              icon="add"
              label="New event"
              onPress={() => router.push('/event/create' as Href)}
              primary
            />
            <QuickAction
              icon="enter-outline"
              label="Join group"
              onPress={() => router.push({ pathname: '/(tabs)/groups', params: { open: 'join' } } as Href)}
            />
            <QuickAction
              icon="people-outline"
              label="New group"
              onPress={() => router.push({ pathname: '/(tabs)/groups', params: { open: 'create' } } as Href)}
            />
          </Reveal>

          {loading ? (
            <>
              <SectionHeader subtitle="Your next shared moments" title="Coming up" />
              <SkeletonList count={2} label="Loading your plans" />
            </>
          ) : laterEvents.length > 0 ? (
            <>
              <SectionHeader
                actionLabel="Calendar"
                onAction={() => router.push('/(tabs)/calendar' as Href)}
                subtitle="Your next shared moments"
                title="Coming up"
              />
              <View style={styles.eventList}>
                {laterEvents.map((event, index) => {
                  const accent = event.color ?? COLORS.primary;
                  return (
                    <Reveal index={index} key={event.id}>
                      <PressableScale
                        accessibilityLabel={`${event.title}, ${eventWhen(event)}, ${event.group_name}`}
                        onPress={() => router.push(`/event/${event.id}` as Href)}
                        scaleTo={0.98}
                        style={styles.eventCard}
                      >
                        <View style={[styles.eventDate, { backgroundColor: tint(event.color ?? BRAND_HEX, 0.12) }]}>
                          <Text numberOfLines={1} style={[styles.eventDay, { color: accent }]}>
                            {tileDay(event.start_time)}
                          </Text>
                          <Text numberOfLines={1} style={styles.eventTime}>{formatEventTime(event)}</Text>
                        </View>
                        <View style={styles.eventContent}>
                          <View style={styles.eventTitleRow}>
                            <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                            {event.is_important ? (
                              <Ionicons accessibilityLabel="Important" color={COLORS.orange} name="star" size={14} />
                            ) : null}
                          </View>
                          <Text numberOfLines={1} style={styles.eventMeta}>
                            {event.group_name}{event.location ? ` · ${event.location}` : ''}
                          </Text>
                        </View>
                        <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
                      </PressableScale>
                    </Reveal>
                  );
                })}
              </View>
            </>
          ) : nextEvent ? (
            <Reveal index={4} style={styles.quietNote}>
              <Ionicons color={COLORS.green} name="checkmark-circle" size={18} />
              <Text style={styles.quietNoteText}>That’s everything coming up for now.</Text>
            </Reveal>
          ) : null}

          <SectionHeader
            actionLabel={groups.length > 0 ? 'See all' : undefined}
            onAction={groups.length > 0 ? () => router.push('/(tabs)/groups' as Href) : undefined}
            subtitle={groups.length ? `${groups.length} circle${groups.length === 1 ? '' : 's'} you plan with` : 'The people you plan with'}
            title="Your groups"
          />

          {loading ? (
            <View style={styles.groupSkeletonRow}>
              {[0, 1, 2].map((item) => (
                <View key={item} style={styles.groupCard}>
                  <Skeleton height={84} radius={RADIUS.md} />
                  <Skeleton height={13} style={styles.groupSkeletonLine} width="70%" />
                </View>
              ))}
            </View>
          ) : groups.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.groupRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.groupScroller}
            >
              {groups.map((group, index) => (
                <Reveal index={index} key={group.id}>
                  <PressableScale
                    accessibilityLabel={`Open ${group.name}`}
                    onPress={() => router.push(`/group/${group.id}` as Href)}
                    style={styles.groupCard}
                  >
                    <View style={[styles.groupArt, { backgroundColor: tint(group.color, 0.16) }]}>
                      {group.image_url ? (
                        <Image source={{ uri: group.image_url }} style={styles.groupImage} />
                      ) : (
                        <Text style={[styles.groupInitial, { color: group.color }]}>
                          {group.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <Text numberOfLines={1} style={styles.groupName}>{group.name}</Text>
                    <View style={styles.groupMetaRow}>
                      <View style={[styles.groupDot, { backgroundColor: group.color }]} />
                      <Text numberOfLines={1} style={styles.groupMeta}>View plans</Text>
                    </View>
                  </PressableScale>
                </Reveal>
              ))}
            </ScrollView>
          ) : (
            <Reveal>
              <PressableScale
                onPress={() => router.push({ pathname: '/(tabs)/groups', params: { open: 'create' } } as Href)}
                scaleTo={0.98}
                style={styles.createGroupCard}
              >
                <View style={styles.createGroupIcon}>
                  <Ionicons color={COLORS.green} name="people" size={24} />
                </View>
                <View style={styles.createGroupCopy}>
                  <Text style={styles.createGroupTitle}>Create your first group</Text>
                  <Text style={styles.createGroupBody}>Bring friends, family, or teammates into one shared plan.</Text>
                </View>
                <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
              </PressableScale>
            </Reveal>
          )}

          <Reveal style={styles.briefCard}>
            <View style={styles.briefIcon}>
              <Ionicons color={COLORS.primary} name="sparkles" size={20} />
            </View>
            <View style={styles.briefCopy}>
              <View style={styles.briefTitleRow}>
                <Text numberOfLines={1} style={styles.briefTitle}>Planado Brief</Text>
                <View style={styles.soonPill}>
                  <Text numberOfLines={1} style={styles.soonPillText}>Coming soon</Text>
                </View>
              </View>
              <Text style={styles.briefBody}>
                A future update will summarize group changes, upcoming plans, and what needs your attention.
              </Text>
            </View>
          </Reveal>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.95}
      style={[styles.quickAction, primary && styles.quickActionPrimary]}
    >
      <View style={[styles.quickIcon, primary && styles.quickIconPrimary]}>
        <Ionicons color={primary ? ON_PRIMARY : COLORS.primary} name={icon} size={21} />
      </View>
      <Text numberOfLines={1} style={[styles.quickLabel, primary && styles.quickLabelPrimary]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 36 },
  page: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  headerCopy: { flex: 1 },
  date: { ...TYPE.overline, color: COLORS.primary },
  greeting: { ...TYPE.title1, marginTop: 6, color: COLORS.ink },
  headerActions: { paddingTop: 4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 44,
    height: 44,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
    borderRadius: 22,
    backgroundColor: COLORS.primarySoft,
    boxShadow: SHADOW.sm,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { ...TYPE.headline, color: COLORS.primary, fontWeight: '800' },
  dayStrip: {
    marginTop: 22,
    padding: 6,
    flexDirection: 'row',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  day: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: RADIUS.lg, backgroundColor: 'transparent' },
  dayActive: { backgroundColor: COLORS.primary, boxShadow: SHADOW.primary },
  dayLabel: { ...TYPE.footnote, color: COLORS.muted, fontWeight: '600' },
  dayLabelActive: { color: ON_PRIMARY },
  dayNumber: { ...TYPE.headline, color: COLORS.ink, fontWeight: '800' },
  dayNumberActive: { color: ON_PRIMARY },
  hero: {
    marginTop: 16,
    padding: 20,
    overflow: 'hidden',
    borderRadius: RADIUS.xxl,
  },
  heroShadow: { boxShadow: SHADOW.md },
  heroLoading: { minHeight: 196, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface },
  heroSkeletonPill: { marginBottom: 18 },
  heroSkeletonTitle: { marginBottom: 12 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroEyebrow: { ...TYPE.overline, color: '#C9CAFF' },
  heroPill: {
    minHeight: 28,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroPillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7BE3BA' },
  heroPillText: { ...TYPE.footnote, color: '#FFFFFF', fontWeight: '700' },
  heroTitleRow: { marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  heroTitle: { ...TYPE.title2, flexShrink: 1, color: '#FFFFFF', fontWeight: '800' },
  heroBody: { ...TYPE.callout, marginTop: 8, color: 'rgba(255,255,255,0.82)', fontWeight: '400' },
  heroMetaRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMeta: { ...TYPE.callout, flex: 1, color: 'rgba(255,255,255,0.86)', fontWeight: '500' },
  heroFooter: {
    marginTop: 18,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  heroLink: { ...TYPE.callout, color: '#FFFFFF', fontWeight: '700' },
  heroButton: {
    minHeight: 46,
    marginTop: 18,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
  },
  heroButtonText: { ...TYPE.callout, color: '#23234D', fontWeight: '800' },
  quickRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  quickAction: {
    flex: 1,
    minHeight: 92,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  quickActionPrimary: { borderColor: 'transparent', backgroundColor: COLORS.primary, boxShadow: SHADOW.primary },
  quickIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft },
  quickIconPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
  quickLabel: { ...TYPE.subhead, color: COLORS.ink, fontWeight: '700' },
  quickLabelPrimary: { color: ON_PRIMARY },
  eventList: { gap: 10 },
  eventCard: {
    minHeight: 78,
    padding: 10,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  eventDate: { width: 84, minHeight: 58, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  eventDay: { ...TYPE.footnote, fontWeight: '800' },
  eventTime: { ...TYPE.footnote, marginTop: 2, color: COLORS.ink, fontWeight: '600' },
  eventContent: { flex: 1 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventTitle: { ...TYPE.headline, flexShrink: 1, color: COLORS.ink },
  eventMeta: { ...TYPE.subhead, marginTop: 3, color: COLORS.muted, fontWeight: '400' },
  quietNote: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.greenSoft,
  },
  quietNoteText: { ...TYPE.subhead, flex: 1, color: COLORS.green, fontWeight: '600' },
  groupScroller: { marginHorizontal: -PAGE.gutter },
  groupRow: { paddingHorizontal: PAGE.gutter, flexDirection: 'row', gap: 12 },
  groupSkeletonRow: { flexDirection: 'row', gap: 12, overflow: 'hidden' },
  groupCard: {
    width: 148,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  groupSkeletonLine: { marginTop: 12, marginBottom: 6 },
  groupArt: { height: 84, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  groupImage: { width: '100%', height: '100%' },
  groupInitial: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
  groupName: { ...TYPE.bodyStrong, marginTop: 10, color: COLORS.ink, fontWeight: '700' },
  groupMetaRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupMeta: { ...TYPE.footnote, color: COLORS.muted },
  createGroupCard: {
    minHeight: 88,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  createGroupIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.greenSoft },
  createGroupCopy: { flex: 1 },
  createGroupTitle: { ...TYPE.headline, color: COLORS.ink },
  createGroupBody: { ...TYPE.subhead, marginTop: 3, color: COLORS.muted, fontWeight: '400' },
  briefCard: {
    marginTop: 28,
    padding: 16,
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.elevated,
  },
  briefIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft },
  briefCopy: { flex: 1 },
  briefTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  briefTitle: { ...TYPE.headline, color: COLORS.ink },
  soonPill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.primarySoft },
  soonPillText: { ...TYPE.footnote, color: COLORS.primary, fontWeight: '700' },
  briefBody: { ...TYPE.subhead, marginTop: 4, color: COLORS.muted, fontWeight: '400' },
});
