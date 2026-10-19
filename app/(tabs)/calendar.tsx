import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/Headers';
import { IconButton } from '../../components/ui/IconButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { Reveal } from '../../components/ui/Reveal';
import { SelectionFill } from '../../components/ui/SelectionFill';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';
import { MOTION, ON_PRIMARY, PAGE, RADIUS, TYPE } from '../../theme/tokens';
import {
  getCalendarEvents,
  getMyCalendarGroups,
  type CalendarEvent,
  type CalendarGroup,
  type EventCategory,
} from '../../services/eventService';
import { supabase } from '../../services/supabase';

type IconName = ComponentProps<typeof Ionicons>['name'];
type CalendarLoadMode = 'initial' | 'refresh' | 'background';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CALENDAR_LOAD_TIMEOUT_MS = 15_000;
const REALTIME_REFRESH_DELAY_MS = 900;

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sameDay(left: Date, right: Date) {
  return dateKey(left) === dateKey(right);
}

function calendarRange(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  const daysSinceMonday = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function friendlyCalendarError(error: unknown) {
  const rawMessage = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : '';
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('unable to resolve host')
    || normalized.includes('unknownhost')
    || normalized.includes('network request failed')
    || normalized.includes('fetch failed')
    || normalized.includes('failed to fetch')
    || normalized.includes('timed out')
  ) {
    return 'Planado cannot reach the server right now. Check your internet connection, then try again.';
  }

  return 'The calendar could not be refreshed. Please try again in a moment.';
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Calendar request timed out.'));
    }, milliseconds);

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

function categoryAppearance(category: EventCategory): {
  icon: IconName;
  color: string;
  background: string;
} {
  switch (category) {
    case 'birthday':
      return { icon: 'gift-outline', color: COLORS.red, background: COLORS.redSoft };
    case 'school':
    case 'study':
      return { icon: 'book-outline', color: COLORS.blue, background: COLORS.blueSoft };
    case 'work':
    case 'deadline':
      return { icon: 'briefcase-outline', color: COLORS.orange, background: COLORS.orangeSoft };
    case 'gym':
      return { icon: 'barbell-outline', color: COLORS.green, background: COLORS.greenSoft };
    case 'trip':
      return { icon: 'airplane-outline', color: COLORS.blue, background: COLORS.blueSoft };
    case 'hangout':
      return { icon: 'people-outline', color: COLORS.primary, background: COLORS.primarySoft };
    case 'personal':
      return { icon: 'person-outline', color: COLORS.primary, background: COLORS.primarySoft };
    default:
      return { icon: 'calendar-outline', color: COLORS.primary, background: COLORS.primarySoft };
  }
}

function eventTime(event: CalendarEvent) {
  if (event.is_all_day) return 'All day';
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export default function CalendarScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [today, setToday] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [monthDirection, setMonthDirection] = useState(0);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<CalendarGroup[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const loadRequestRef = useRef(0);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const range = useMemo(() => calendarRange(visibleMonth), [visibleMonth]);

  const loadCalendar = useCallback(async (mode: CalendarLoadMode = 'initial') => {
    if (!user) return;
    const requestId = ++loadRequestRef.current;
    if (mode === 'refresh') setRefreshing(true);
    else if (!hasLoadedRef.current) setLoading(true);
    setError(null);

    try {
      const [groupData, eventData] = await withTimeout(
        Promise.all([
          getMyCalendarGroups(),
          getCalendarEvents(range.start, range.end),
        ]),
        CALENDAR_LOAD_TIMEOUT_MS,
      );
      if (requestId !== loadRequestRef.current) return;
      setGroups(groupData);
      setEvents(eventData);
      setSelectedGroupId((currentGroupId) => (
        currentGroupId && !groupData.some((group) => group.id === currentGroupId)
          ? null
          : currentGroupId
      ));
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Could not load calendar:', loadError);
      setError(friendlyCalendarError(loadError));
    } finally {
      if (requestId !== loadRequestRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [range.end, range.start, user]);

  const loadCalendarRef = useRef(loadCalendar);
  useEffect(() => {
    loadCalendarRef.current = loadCalendar;
  }, [loadCalendar]);

  useFocusEffect(
    useCallback(() => {
      setToday(new Date());
      void loadCalendar(hasLoadedRef.current ? 'background' : 'initial');
      return () => {
        loadRequestRef.current += 1;
      };
    }, [loadCalendar]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const scheduleRefresh = () => {
        if (realtimeRefreshTimerRef.current) {
          clearTimeout(realtimeRefreshTimerRef.current);
        }
        realtimeRefreshTimerRef.current = setTimeout(() => {
          realtimeRefreshTimerRef.current = null;
          void loadCalendarRef.current('background');
        }, REALTIME_REFRESH_DELAY_MS);
      };
      const channel = supabase
        .channel(`calendar:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, scheduleRefresh)
        .subscribe();

      return () => {
        if (realtimeRefreshTimerRef.current) {
          clearTimeout(realtimeRefreshTimerRef.current);
          realtimeRefreshTimerRef.current = null;
        }
        void supabase.removeChannel(channel);
      };
    }, [user]),
  );

  const calendarDays = useMemo(() => {
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(range.start);
      date.setDate(range.start.getDate() + index);
      return date;
    });
  }, [range.start]);

  const calendarWeeks = useMemo(
    () => Array.from({ length: 6 }, (_, index) => calendarDays.slice(index * 7, index * 7 + 7)),
    [calendarDays],
  );

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.status === 'active' &&
          (!selectedGroupId || event.group_id === selectedGroupId),
      ),
    [events, selectedGroupId],
  );

  const eventsByDate = useMemo(() => {
    const indexedEvents = new Map<string, CalendarEvent[]>();

    for (const event of filteredEvents) {
      const eventStart = startOfDay(new Date(event.start_time));
      const eventEnd = endOfDay(new Date(event.end_time));
      const cursor = new Date(Math.max(eventStart.getTime(), range.start.getTime()));
      const lastVisibleDay = Math.min(eventEnd.getTime(), range.end.getTime());

      while (cursor.getTime() <= lastVisibleDay) {
        const key = dateKey(cursor);
        const dayEvents = indexedEvents.get(key);
        if (dayEvents) dayEvents.push(event);
        else indexedEvents.set(key, [event]);
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return indexedEvents;
  }, [filteredEvents, range.end, range.start]);

  const selectedEvents = useMemo(
    () => eventsByDate.get(dateKey(selectedDate)) ?? [],
    [eventsByDate, selectedDate],
  );

  function moveMonth(offset: number) {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setMonthDirection(offset);
    setVisibleMonth(next);
    setSelectedDate(next);
  }

  function goToToday() {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    setMonthDirection(Math.sign(thisMonth.getTime() - visibleMonth.getTime()));
    setVisibleMonth(thisMonth);
    setSelectedDate(now);
  }

  function selectDay(day: Date) {
    setSelectedDate(day);
    if (day.getMonth() !== visibleMonth.getMonth()) {
      const nextMonth = new Date(day.getFullYear(), day.getMonth(), 1);
      setMonthDirection(Math.sign(nextMonth.getTime() - visibleMonth.getTime()));
      setVisibleMonth(nextMonth);
    }
  }

  function createForSelectedDay() {
    router.push({
      pathname: '/event/create',
      params: {
        date: dateKey(selectedDate),
        ...(selectedGroupId ? { groupId: selectedGroupId } : {}),
      },
    } as Href);
  }

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(visibleMonth);
  const selectedIsToday = sameDay(selectedDate, today);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[COLORS.primary]}
            onRefresh={() => void loadCalendar('refresh')}
            refreshing={refreshing}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <PageHeader
            actions={<Button icon="add" label="New event" onPress={createForSelectedDay} size="sm" />}
            eyebrow="Shared time"
            title="Calendar"
          />

          <Reveal index={1}>
            <ScrollView
              contentContainerStyle={styles.groupFilters}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroller}
            >
              <FilterChip
                active={!selectedGroupId}
                color={COLORS.primary}
                label="All plans"
                onPress={() => setSelectedGroupId(null)}
              />
              {groups.map((group) => (
                <FilterChip
                  active={selectedGroupId === group.id}
                  color={group.color}
                  key={group.id}
                  label={group.name}
                  onPress={() => setSelectedGroupId(group.id)}
                />
              ))}
            </ScrollView>
          </Reveal>

          <Banner
            action={
              <Button
                disabled={loading || refreshing}
                label="Retry"
                onPress={() => void loadCalendar('initial')}
                size="sm"
                style={styles.retryButton}
                variant="secondary"
              />
            }
            message={error}
            title="Calendar is temporarily offline"
          />

          <Reveal index={2} style={styles.calendarCard}>
            <View style={styles.monthHeader}>
              <IconButton icon="chevron-back" label="Previous month" onPress={() => moveMonth(-1)} size={20} tone="ghost" />
              <View style={styles.monthCopy}>
                <Text accessibilityLiveRegion="polite" style={styles.monthTitle}>{monthLabel}</Text>
                <Text style={[styles.monthMeta, loading && styles.monthMetaLoading]}>
                  {loading
                    ? 'Loading plans…'
                    : `${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'} in view`}
                </Text>
              </View>
              <IconButton icon="chevron-forward" label="Next month" onPress={() => moveMonth(1)} size={20} tone="ghost" />
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((weekday) => (
                <Text key={weekday} style={styles.weekday}>{weekday}</Text>
              ))}
            </View>

            <MotiView
              animate={{ opacity: 1, translateX: 0 }}
              // Only slide after the user changes month, so the first paint is instant.
              from={monthDirection === 0 ? undefined : { opacity: 0, translateX: monthDirection * 18 }}
              key={dateKey(visibleMonth)}
              transition={{ type: 'timing', duration: MOTION.base, easing: MOTION.easeOut }}
            >
              {calendarWeeks.map((week, weekIndex) => (
                <View key={`week-${weekIndex}`} style={styles.weekRow}>
                  {week.map((day) => {
                    const dayEvents = eventsByDate.get(dateKey(day)) ?? [];
                    const selected = sameDay(day, selectedDate);
                    const isToday = sameDay(day, today);
                    const outsideMonth = day.getMonth() !== visibleMonth.getMonth();
                    const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(day);
                    return (
                      <Pressable
                        accessibilityLabel={`${dayLabel}${isToday ? ', today' : ''}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={dateKey(day)}
                        onPress={() => selectDay(day)}
                        style={styles.dayCell}
                      >
                        <View style={styles.dayCircle}>
                          {selected ? <SelectionFill radius={18} /> : null}
                          {isToday && !selected ? <SelectionFill radius={18} variant="ring" /> : null}
                          <Text
                            style={[
                              styles.dayNumber,
                              outsideMonth && styles.dayNumberOutside,
                              isToday && !selected && styles.dayNumberToday,
                              selected && styles.dayNumberSelected,
                            ]}
                          >
                            {day.getDate()}
                          </Text>
                        </View>
                        <View style={styles.eventDots}>
                          {dayEvents.slice(0, 3).map((event) => (
                            <View
                              key={event.id}
                              style={[styles.eventDot, { backgroundColor: event.color ?? COLORS.primary }]}
                            />
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </MotiView>

            {!selectedIsToday || visibleMonth.getMonth() !== today.getMonth() ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={goToToday} style={styles.todayLink}>
                <Ionicons color={COLORS.primary} name="return-down-back" size={15} />
                <Text numberOfLines={1} style={styles.todayLinkText}>Back to today</Text>
              </Pressable>
            ) : null}
          </Reveal>

          <View style={styles.agendaHeader}>
            <View style={styles.agendaCopy}>
              <Text accessibilityRole="header" style={styles.agendaTitle}>
                {selectedIsToday
                  ? `Today · ${new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(selectedDate)}`
                  : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(selectedDate)}
              </Text>
              <Text style={styles.agendaSubtitle}>
                {selectedEvents.length
                  ? `${selectedEvents.length} plan${selectedEvents.length === 1 ? '' : 's'} scheduled`
                  : 'No plans scheduled'}
              </Text>
            </View>
            <View style={styles.agendaDateBadge}>
              <Text style={styles.agendaDateMonth}>
                {new Intl.DateTimeFormat(undefined, { month: 'short' }).format(selectedDate).toUpperCase()}
              </Text>
              <Text style={styles.agendaDateNumber}>{selectedDate.getDate()}</Text>
            </View>
          </View>

          {selectedEvents.length ? (
            <View style={styles.eventList}>
              {selectedEvents.map((event, index) => {
                const appearance = categoryAppearance(event.category);
                const completed = new Date(event.end_time).getTime() < today.getTime();
                return (
                  <Reveal index={index} key={`${dateKey(selectedDate)}-${event.id}`}>
                    <PressableScale
                      accessibilityLabel={`${event.title}, ${eventTime(event)}, ${event.group_name}${completed ? ', done' : ''}`}
                      onPress={() => router.push(`/event/${event.id}` as Href)}
                      scaleTo={0.98}
                      style={[styles.eventCard, completed && styles.eventCardCompleted]}
                    >
                      <View style={[styles.eventAccent, { backgroundColor: event.color ?? appearance.color }]} />
                      <View style={[styles.eventIcon, { backgroundColor: appearance.background }]}>
                        <Ionicons color={appearance.color} name={appearance.icon} size={21} />
                      </View>
                      <View style={styles.eventCopy}>
                        <View style={styles.eventTitleRow}>
                          <Text numberOfLines={1} style={[styles.eventTitle, completed && styles.eventTitleCompleted]}>
                            {event.title}
                          </Text>
                          {event.is_important ? (
                            <Ionicons accessibilityLabel="Important" color={COLORS.orange} name="star" size={14} />
                          ) : null}
                          {event.visibility === 'private' ? (
                            <Ionicons accessibilityLabel="Private" color={COLORS.faint} name="lock-closed" size={13} />
                          ) : null}
                        </View>
                        <Text style={[styles.eventTime, completed && styles.eventTimeCompleted]}>
                          {eventTime(event)}
                        </Text>
                        <Text numberOfLines={1} style={styles.eventMeta}>
                          {event.group_name}{event.location ? ` · ${event.location}` : ''}
                        </Text>
                      </View>
                      {completed ? (
                        <View style={styles.completedBadge}>
                          <Ionicons color={COLORS.green} name="checkmark" size={13} />
                          <Text style={styles.completedBadgeText}>Done</Text>
                        </View>
                      ) : (
                        <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
                      )}
                    </PressableScale>
                  </Reveal>
                );
              })}
            </View>
          ) : (
            <EmptyState
              body="Nothing is planned for this date. Enjoy the space or plan something together."
              icon="calendar-clear-outline"
              key={dateKey(selectedDate)}
              title="A clear day"
            >
              <Button icon="add" label="Plan something" onPress={createForSelectedDay} size="sm" variant="soft" />
            </EmptyState>
          )}

          <View style={styles.legend}>
            <Ionicons color={COLORS.faint} name="information-circle-outline" size={16} />
            <Text style={styles.legendText}>Dots use each event’s color. Pick a group above to focus the calendar.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterChip({
  active,
  color,
  label,
  onPress,
}: {
  active: boolean;
  color: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      scaleTo={0.95}
      style={[styles.groupChip, active && styles.groupChipActive]}
    >
      <View style={[styles.groupDot, { backgroundColor: active ? ON_PRIMARY : color }]} />
      <Text numberOfLines={1} style={[styles.groupChipText, active && styles.groupChipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 36 },
  page: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter, paddingTop: 12 },
  filterScroller: { marginHorizontal: -PAGE.gutter },
  groupFilters: { paddingTop: 18, paddingBottom: 2, paddingHorizontal: PAGE.gutter, gap: 8 },
  groupChip: {
    maxWidth: 180,
    minHeight: 40,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
  },
  groupChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  groupDot: { width: 9, height: 9, borderRadius: 5 },
  groupChipText: { ...TYPE.subhead, flexShrink: 1, color: COLORS.ink, fontWeight: '600' },
  groupChipTextActive: { color: ON_PRIMARY, fontWeight: '700' },
  retryButton: { minHeight: 40 },
  calendarCard: {
    marginTop: 14,
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  monthHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthCopy: { flex: 1, alignItems: 'center' },
  monthTitle: { width: '100%', ...TYPE.headline, color: COLORS.ink, fontWeight: '800', textAlign: 'center' },
  monthMeta: { width: '100%', ...TYPE.footnote, marginTop: 2, color: COLORS.muted, textAlign: 'center' },
  monthMetaLoading: { color: COLORS.primary, fontWeight: '600' },
  weekdayRow: { marginTop: 6, marginBottom: 4, flexDirection: 'row' },
  weekday: { ...TYPE.footnote, flex: 1, color: COLORS.muted, fontWeight: '600', textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, height: 52, paddingTop: 3, alignItems: 'center' },
  dayCircle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  dayNumber: { ...TYPE.callout, color: COLORS.ink, fontWeight: '600' },
  dayNumberOutside: { color: COLORS.faint, fontWeight: '400', opacity: 0.6 },
  dayNumberToday: { color: COLORS.primary, fontWeight: '800' },
  dayNumberSelected: { color: ON_PRIMARY, fontWeight: '800' },
  eventDots: { height: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  eventDot: { width: 5, height: 5, borderRadius: 3 },
  todayLink: {
    minHeight: 36,
    marginTop: 6,
    alignSelf: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primarySoft,
  },
  todayLinkText: { ...TYPE.subhead, color: COLORS.primary, fontWeight: '700' },
  agendaHeader: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  agendaCopy: { flex: 1 },
  agendaTitle: { ...TYPE.title3, color: COLORS.ink },
  agendaSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  agendaDateBadge: { width: 52, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  agendaDateMonth: { ...TYPE.footnote, color: COLORS.primary, fontWeight: '800', letterSpacing: 0.6 },
  agendaDateNumber: { fontSize: 20, lineHeight: 24, color: COLORS.primary, fontWeight: '800' },
  eventList: { gap: 10 },
  eventCard: {
    minHeight: 88,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  eventCardCompleted: { backgroundColor: COLORS.elevated },
  eventAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  eventIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm },
  eventCopy: { flex: 1 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventTitle: { ...TYPE.headline, flexShrink: 1, color: COLORS.ink },
  eventTitleCompleted: { color: COLORS.muted },
  eventTime: { ...TYPE.subhead, marginTop: 3, color: COLORS.primary, fontWeight: '700' },
  eventTimeCompleted: { color: COLORS.green },
  eventMeta: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  completedBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.greenSoft,
  },
  completedBadgeText: { ...TYPE.footnote, color: COLORS.green, fontWeight: '700' },
  legend: { marginTop: 18, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  legendText: { ...TYPE.footnote, flexShrink: 1, color: COLORS.muted, fontWeight: '400', textAlign: 'center' },
});
