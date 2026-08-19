import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
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

import { PlanadoLoader } from '../../components/PlanadoLoader';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';
import {
  getCalendarEvents,
  getMyCalendarGroups,
  type CalendarEvent,
  type CalendarGroup,
  type EventCategory,
} from '../../services/eventService';
import { supabase } from '../../services/supabase';

type IconName = ComponentProps<typeof Ionicons>['name'];

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

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

function eventTouchesDay(event: CalendarEvent, day: Date) {
  return new Date(event.start_time) <= endOfDay(day) && new Date(event.end_time) >= startOfDay(day);
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
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<CalendarGroup[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => calendarRange(visibleMonth), [visibleMonth]);

  const loadCalendar = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [groupData, eventData] = await Promise.all([
        getMyCalendarGroups(),
        getCalendarEvents(range.start, range.end),
      ]);
      setGroups(groupData);
      setEvents(eventData);
      if (selectedGroupId && !groupData.some((group) => group.id === selectedGroupId)) {
        setSelectedGroupId(null);
      }
    } catch (loadError) {
      console.error('Could not load calendar:', loadError);
      setError(
        loadError instanceof Error ? loadError.message : 'The calendar could not be loaded.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range.end, range.start, selectedGroupId, user]);

  const loadCalendarRef = useRef(loadCalendar);
  useEffect(() => {
    loadCalendarRef.current = loadCalendar;
  }, [loadCalendar]);

  useFocusEffect(
    useCallback(() => {
      void loadCalendar();
    }, [loadCalendar]),
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`calendar:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        void loadCalendarRef.current(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

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

  const selectedEvents = useMemo(
    () => filteredEvents.filter((event) => eventTouchesDay(event, selectedDate)),
    [filteredEvents, selectedDate],
  );

  function moveMonth(offset: number) {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(next);
    setSelectedDate(next);
  }

  function goToToday() {
    const now = new Date();
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  }

  function selectDay(day: Date) {
    setSelectedDate(day);
    if (day.getMonth() !== visibleMonth.getMonth()) {
      setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[COLORS.primary]}
            onRefresh={() => void loadCalendar(true)}
            refreshing={refreshing}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>SHARED TIME</Text>
              <Text style={styles.title}>Calendar</Text>
            </View>
            <Pressable
              onPress={() => router.push({
                pathname: '/event/create',
                params: {
                  date: dateKey(selectedDate),
                  ...(selectedGroupId ? { groupId: selectedGroupId } : {}),
                },
              } as Href)}
              style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
            >
              <Ionicons color="#FFFFFF" name="add" size={19} />
              <Text style={styles.createButtonText}>New event</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupFilters}
          >
            <Pressable
              onPress={() => setSelectedGroupId(null)}
              style={[styles.groupChip, !selectedGroupId && styles.groupChipActive]}
            >
              <View style={[styles.groupDot, { backgroundColor: !selectedGroupId ? '#FFFFFF' : COLORS.primary }]} />
              <Text style={[styles.groupChipText, !selectedGroupId && styles.groupChipTextActive]}>All plans</Text>
            </Pressable>
            {groups.map((group) => {
              const active = selectedGroupId === group.id;
              return (
                <Pressable
                  key={group.id}
                  onPress={() => setSelectedGroupId(group.id)}
                  style={[styles.groupChip, active && styles.groupChipActive]}
                >
                  <View style={[styles.groupDot, { backgroundColor: active ? '#FFFFFF' : group.color }]} />
                  <Text numberOfLines={1} style={[styles.groupChipText, active && styles.groupChipTextActive]}>{group.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons color={COLORS.red} name="alert-circle" size={17} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.calendarCard}>
            <View style={styles.monthHeader}>
              <Pressable onPress={() => moveMonth(-1)} style={styles.monthArrow}>
                <Ionicons color={COLORS.ink} name="chevron-back" size={19} />
              </Pressable>
              <View style={styles.monthCopy}>
                <Text style={styles.monthTitle}>
                  {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(visibleMonth)}
                </Text>
                <Text style={styles.monthMeta}>{filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'} this view</Text>
              </View>
              <Pressable onPress={goToToday} style={styles.todayButton}>
                <Text style={styles.todayButtonText}>Today</Text>
              </Pressable>
              <Pressable onPress={() => moveMonth(1)} style={styles.monthArrow}>
                <Ionicons color={COLORS.ink} name="chevron-forward" size={19} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((weekday) => (
                <Text key={weekday} style={styles.weekday}>{weekday}</Text>
              ))}
            </View>

            {loading ? (
              <View style={styles.calendarLoading}>
                <PlanadoLoader compact message="Loading shared plans..." />
              </View>
            ) : (
              <View style={styles.grid}>
                {calendarWeeks.map((week, weekIndex) => (
                  <View key={`week-${weekIndex}`} style={styles.weekRow}>
                    {week.map((day) => {
                      const dayEvents = filteredEvents.filter((event) => eventTouchesDay(event, day));
                      const selected = sameDay(day, selectedDate);
                      const isToday = sameDay(day, today);
                      const outsideMonth = day.getMonth() !== visibleMonth.getMonth();
                      return (
                        <Pressable
                          key={dateKey(day)}
                          onPress={() => selectDay(day)}
                          style={[styles.dayCell, selected && styles.dayCellSelected]}
                        >
                          <View style={[styles.dayNumberCircle, isToday && !selected && styles.todayCircle]}>
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
                                style={[
                                  styles.eventDot,
                                  { backgroundColor: selected ? '#FFFFFF' : event.color ?? COLORS.primary },
                                ]}
                              />
                            ))}
                            {dayEvents.length > 3 ? (
                              <Text style={[styles.moreDots, selected && styles.moreDotsSelected]}>+{dayEvents.length - 3}</Text>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.agendaHeader}>
            <View>
              <Text style={styles.agendaTitle}>
                {sameDay(selectedDate, today)
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
              {selectedEvents.map((event) => {
                const appearance = categoryAppearance(event.category);
                const completed = new Date(event.end_time).getTime() < today.getTime();
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => router.push(`/event/${event.id}` as Href)}
                    style={({ pressed }) => [
                      styles.eventCard,
                      completed && styles.eventCardCompleted,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.eventAccent, { backgroundColor: event.color ?? appearance.color }]} />
                    <View style={[styles.eventIcon, { backgroundColor: appearance.background }]}>
                      <Ionicons color={appearance.color} name={appearance.icon} size={21} />
                    </View>
                    <View style={styles.eventCopy}>
                      <View style={styles.eventTitleRow}>
                        <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                        {event.is_important ? (
                          <Ionicons color={COLORS.orange} name="star" size={12} />
                        ) : null}
                        {event.visibility === 'private' ? (
                          <Ionicons color={COLORS.faint} name="lock-closed" size={12} />
                        ) : null}
                      </View>
                      <Text style={[styles.eventTime, completed && styles.eventTimeCompleted]}>
                        {eventTime(event)}
                      </Text>
                      <Text numberOfLines={1} style={styles.eventMeta}>
                        {event.group_name}{event.location ? `  ·  ${event.location}` : ''}
                      </Text>
                    </View>
                    <View style={styles.eventTrailing}>
                      {completed ? (
                        <View style={styles.completedBadge}>
                          <Ionicons color={COLORS.green} name="checkmark" size={10} />
                          <Text style={styles.completedBadgeText}>Done</Text>
                        </View>
                      ) : null}
                      <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyAgenda}>
              <View style={styles.emptyIcon}>
                <Ionicons color={COLORS.primary} name="calendar-clear-outline" size={29} />
              </View>
              <View style={styles.emptyCopy}>
                <Text style={styles.emptyTitle}>A clear day</Text>
                <Text style={styles.emptyBody}>Nothing is planned for this date. Enjoy the space or create something together.</Text>
              </View>
            </View>
          )}

          <View style={styles.legend}>
            <Ionicons color={COLORS.faint} name="information-circle-outline" size={15} />
            <Text style={styles.legendText}>Dots show the group color for each event. Select a group above to focus the calendar.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 34 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 13 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: COLORS.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.15 },
  title: { marginTop: 3, color: COLORS.ink, fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  createButton: { minHeight: 42, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, backgroundColor: COLORS.primary },
  createButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  groupFilters: { paddingTop: 17, paddingBottom: 4, gap: 8 },
  groupChip: { maxWidth: 150, minHeight: 37, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  groupChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupChipText: { color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  groupChipTextActive: { color: '#FFFFFF' },
  errorBanner: { marginTop: 11, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, backgroundColor: COLORS.redSoft },
  errorText: { flex: 1, color: COLORS.red, fontSize: 9, lineHeight: 14 },
  calendarCard: { marginTop: 14, padding: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 25, backgroundColor: COLORS.surface },
  monthHeader: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 5 },
  monthArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.elevated },
  monthCopy: { flex: 1, paddingLeft: 4 },
  monthTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  monthMeta: { marginTop: 2, color: COLORS.faint, fontSize: 8 },
  todayButton: { minHeight: 32, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 11 },
  todayButtonText: { color: COLORS.primary, fontSize: 8, fontWeight: '900' },
  weekdayRow: { marginTop: 8, flexDirection: 'row' },
  weekday: { width: '14.285714%', color: COLORS.faint, fontSize: 7, fontWeight: '900', textAlign: 'center', letterSpacing: 0.45 },
  calendarLoading: { minHeight: 340, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: COLORS.muted, fontSize: 9 },
  grid: { marginTop: 6 },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, height: 54, paddingTop: 4, alignItems: 'center', borderRadius: 14 },
  dayCellSelected: { backgroundColor: COLORS.primary },
  dayNumberCircle: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  todayCircle: { backgroundColor: COLORS.primarySoft },
  dayNumber: { color: COLORS.ink, fontSize: 10, fontWeight: '800' },
  dayNumberOutside: { color: COLORS.faint },
  dayNumberToday: { color: COLORS.primary },
  dayNumberSelected: { color: '#FFFFFF' },
  eventDots: { minHeight: 10, marginTop: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },
  moreDots: { color: COLORS.faint, fontSize: 6, fontWeight: '800' },
  moreDotsSelected: { color: '#DCDCFF' },
  agendaHeader: { marginTop: 25, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  agendaTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.35 },
  agendaSubtitle: { marginTop: 3, color: COLORS.faint, fontSize: 9 },
  agendaDateBadge: { width: 45, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.primarySoft },
  agendaDateMonth: { color: COLORS.primary, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  agendaDateNumber: { marginTop: 1, color: COLORS.primary, fontSize: 17, fontWeight: '900' },
  eventList: { gap: 9 },
  eventCard: { minHeight: 84, paddingRight: 13, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  eventCardCompleted: { backgroundColor: COLORS.elevated },
  eventAccent: { width: 5, alignSelf: 'stretch' },
  eventIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  eventCopy: { flex: 1, paddingVertical: 12 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventTitle: { flexShrink: 1, color: COLORS.ink, fontSize: 12, fontWeight: '900' },
  eventTime: { marginTop: 4, color: COLORS.primary, fontSize: 9, fontWeight: '800' },
  eventTimeCompleted: { color: COLORS.green },
  eventMeta: { marginTop: 4, color: COLORS.muted, fontSize: 8 },
  eventTrailing: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  completedBadge: { minHeight: 24, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 9, backgroundColor: COLORS.greenSoft },
  completedBadgeText: { color: COLORS.green, fontSize: 7, fontWeight: '900' },
  emptyAgenda: { minHeight: 112, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: COLORS.line, borderRadius: 21, backgroundColor: COLORS.surface },
  emptyIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: COLORS.primarySoft },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  emptyBody: { marginTop: 5, color: COLORS.muted, fontSize: 9, lineHeight: 14 },
  legend: { marginTop: 16, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  legendText: { flexShrink: 1, color: COLORS.faint, fontSize: 8, lineHeight: 12, textAlign: 'center' },
});
