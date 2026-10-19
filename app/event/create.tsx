import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { PlanadoDateTimePicker } from '../../components/PlanadoDateTimePicker';
import { PlanadoLoader } from '../../components/PlanadoLoader';
import { AnimatedSwitch } from '../../components/ui/AnimatedSwitch';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/ui/Headers';
import { PressableScale } from '../../components/ui/PressableScale';
import { Reveal } from '../../components/ui/Reveal';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';
import { GRADIENT, gradientStyle, ON_PRIMARY, PAGE, RADIUS, SHADOW, TYPE } from '../../theme/tokens';
import {
  createEvent,
  getMyCalendarGroups,
  type CalendarGroup,
  type EventCategory,
} from '../../services/eventService';

type RetentionChoice = 'permanent' | 'temporary';
type OpenPicker = 'date' | 'start' | 'end' | null;

const EVENT_COLORS = ['#5B5CE2', '#4B82D0', '#24966B', '#DF823C', '#D85B87', '#8A65C7'];

const CATEGORIES: { value: EventCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'hangout', label: 'Hangout', icon: 'people-outline' },
  { value: 'school', label: 'School', icon: 'school-outline' },
  { value: 'study', label: 'Study', icon: 'book-outline' },
  { value: 'work', label: 'Work', icon: 'briefcase-outline' },
  { value: 'deadline', label: 'Deadline', icon: 'flag-outline' },
  { value: 'birthday', label: 'Birthday', icon: 'gift-outline' },
  { value: 'gym', label: 'Gym', icon: 'barbell-outline' },
  { value: 'trip', label: 'Trip', icon: 'airplane-outline' },
  { value: 'personal', label: 'Personal', icon: 'person-outline' },
  { value: 'other', label: 'Other', icon: 'calendar-outline' },
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function friendlyDate(value: string) {
  const date = parseLocalDateTime(value, '12:00');
  if (!date) return 'Choose a date';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function friendlyTime(date: string, value: string) {
  const parsed = parseLocalDateTime(date, value);
  if (!parsed) return 'Choose time';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function initialTimes() {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() < 30 ? 30 : 0);
  if (start.getMinutes() === 0) start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

function parseLocalDateTime(date: string, time: string) {
  const normalizedDate = date.trim();
  const normalizedTime = time.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{1,2}:\d{2}$/.test(normalizedTime)) return null;
  const [year, month, day] = normalizedDate.split('-').map(Number);
  const [hour, minute] = normalizedTime.split(':').map(Number);
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day ||
    result.getHours() !== hour ||
    result.getMinutes() !== minute
  ) return null;
  return result;
}

function messageFrom(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message;
  return 'The event could not be created.';
}

export default function CreateEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string | string[]; groupId?: string | string[] }>();
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const requestedGroupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId;
  const { user, loading: authLoading } = useAuth();
  const defaults = useMemo(() => initialTimes(), []);
  const [groups, setGroups] = useState<CalendarGroup[]>([]);
  const [groupId, setGroupId] = useState(requestedGroupId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<EventCategory>('hangout');
  const [date, setDate] = useState(requestedDate ?? dateInputValue(defaults.start));
  const [startTime, setStartTime] = useState(timeInputValue(defaults.start));
  const [endTime, setEndTime] = useState(timeInputValue(defaults.end));
  const [allDay, setAllDay] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [visibility, setVisibility] = useState<'group' | 'private'>('group');
  const [retention, setRetention] = useState<RetentionChoice>('permanent');
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void getMyCalendarGroups()
      .then((data) => {
        if (!active) return;
        setGroups(data);
        const preferred = data.find((group) => group.id === requestedGroupId) ?? data[0];
        if (preferred) {
          setGroupId((current) => current || preferred.id);
          setColor(preferred.color);
        }
      })
      .catch((loadError) => {
        if (active) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (active) setLoadingGroups(false);
      });
    return () => { active = false; };
  }, [requestedGroupId, user]);

  if (!authLoading && !user) return <Redirect href="/login" />;

  function chooseGroup(group: CalendarGroup) {
    setGroupId(group.id);
    setColor(group.color);
  }

  async function submit() {
    if (saving) return;
    setError(null);
    if (!title.trim()) return setError('Give your event a title.');
    if (title.trim().length > 120) return setError('Title must be 120 characters or fewer.');
    if (!groupId) return setError('Choose a group for this event.');
    if (description.length > 5000) return setError('Description must be 5,000 characters or fewer.');
    if (location.length > 300) return setError('Location must be 300 characters or fewer.');

    const start = parseLocalDateTime(date, allDay ? '00:00' : startTime);
    const end = parseLocalDateTime(date, allDay ? '23:59' : endTime);
    if (!start || !end) return setError('Use a valid date and 24-hour time. Examples: 2026-08-13, 9:00, and 13:00.');
    if (end < start) return setError('End time must be after the start time.');

    setSaving(true);
    try {
      await createEvent({
        groupId,
        title,
        description,
        location,
        category,
        startTime: start,
        endTime: end,
        isAllDay: allDay,
        isImportant,
        color,
        visibility,
        retentionPolicy: retention,
      });
      if (Platform.OS === 'web') {
        Alert.alert('Event created', `${title.trim()} is now on the calendar.`);
        router.replace('/(tabs)/calendar' as Href);
      } else {
        Alert.alert('Event created', `${title.trim()} is now on the calendar.`, [
          { text: 'View calendar', onPress: () => router.replace('/(tabs)/calendar' as Href) },
        ]);
      }
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setSaving(false);
    }
  }

  function currentPickerValue() {
    const selectedTime = openPicker === 'end' ? endTime : startTime;
    return parseLocalDateTime(date, selectedTime) ?? new Date(defaults.start);
  }

  function confirmPicker(value: Date) {
    if (openPicker === 'date') setDate(dateInputValue(value));
    if (openPicker === 'start') {
      const previousStart = parseLocalDateTime(date, startTime);
      const previousEnd = parseLocalDateTime(date, endTime);
      setStartTime(timeInputValue(value));
      // Moving the start keeps the event's length, ending by midnight at the latest.
      if (previousStart && previousEnd && previousEnd >= previousStart) {
        const end = new Date(value.getTime() + previousEnd.getTime() - previousStart.getTime());
        setEndTime(end.getDate() === value.getDate() ? timeInputValue(end) : '23:59');
      }
    }
    if (openPicker === 'end') setEndTime(timeInputValue(value));
  }

  if (authLoading || loadingGroups) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <PlanadoLoader fullScreen message="Preparing your event..." />
      </SafeAreaView>
    );
  }

  const previewWhen = allDay
    ? `${friendlyDate(date)} · All day`
    : `${friendlyDate(date)} · ${friendlyTime(date, startTime)} – ${friendlyTime(date, endTime)}`;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.page}>
            <TopBar eyebrow="Plan something together" onBack={() => router.back()} title="Create event" />

            <Reveal style={[styles.heroCard, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
              <View style={[styles.heroIcon, { backgroundColor: color }]}>
                <Ionicons color="#FFFFFF" name={CATEGORIES.find((option) => option.value === category)?.icon ?? 'calendar-outline'} size={24} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>Preview</Text>
                <Text numberOfLines={1} style={styles.heroTitle}>{title.trim() || 'Your next plan'}</Text>
                <Text numberOfLines={2} style={styles.heroBody}>{previewWhen}</Text>
              </View>
              {isImportant ? <Ionicons accessibilityLabel="Important" color="#FFD089" name="star" size={20} /> : null}
            </Reveal>

            <Banner message={error} />

            {!groups.length ? (
              <EmptyState
                body="Every Planado event belongs to a planning space, even when its visibility is private."
                icon="people-outline"
                style={styles.emptyGroups}
                title="Create or join a group first"
              >
                <Button label="Go to groups" onPress={() => router.replace('/(tabs)/groups' as Href)} size="sm" />
              </EmptyState>
            ) : (
              <>
                <SectionTitle subtitle="The essentials everyone needs" title="Event details" />
                <Reveal style={styles.formCard}>
                  <FieldLabel count={`${title.length}/120`} first label="Title" />
                  <View style={styles.inputShell}>
                    <Ionicons color={COLORS.muted} name="create-outline" size={18} />
                    <TextInput accessibilityLabel="Title" maxLength={120} onChangeText={setTitle} placeholder="Study session" placeholderTextColor={COLORS.faint} style={styles.input} value={title} />
                  </View>
                  <FieldLabel count={`${location.length}/300`} label="Location" />
                  <View style={styles.inputShell}>
                    <Ionicons color={COLORS.muted} name="location-outline" size={18} />
                    <TextInput accessibilityLabel="Location" maxLength={300} onChangeText={setLocation} placeholder="Library, room, or link" placeholderTextColor={COLORS.faint} style={styles.input} value={location} />
                  </View>
                  <FieldLabel count={`${description.length}/5000`} label="Description" />
                  <View style={[styles.inputShell, styles.textAreaShell]}>
                    <TextInput accessibilityLabel="Description" maxLength={5000} multiline onChangeText={setDescription} placeholder="Add notes, what to bring, or an agenda..." placeholderTextColor={COLORS.faint} style={[styles.input, styles.textArea]} textAlignVertical="top" value={description} />
                  </View>
                </Reveal>

                <SectionTitle subtitle="Choose who this belongs to" title="Planning space" />
                <ScrollView contentContainerStyle={styles.groupRow} horizontal showsHorizontalScrollIndicator={false} style={styles.groupScroller}>
                  {groups.map((group) => {
                    const active = group.id === groupId;
                    return (
                      <PressableScale
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        key={group.id}
                        onPress={() => chooseGroup(group)}
                        scaleTo={0.95}
                        style={[styles.groupChip, active && styles.groupChipActive]}
                      >
                        <View style={[styles.groupDot, { backgroundColor: active ? ON_PRIMARY : group.color }]} />
                        <Text numberOfLines={1} style={[styles.groupChipText, active && styles.groupChipTextActive]}>{group.name}</Text>
                        {active ? <Ionicons color={ON_PRIMARY} name="checkmark" size={16} /> : null}
                      </PressableScale>
                    );
                  })}
                </ScrollView>

                <SectionTitle subtitle="Use your local date and time" title="When" />
                <Reveal style={styles.formCard}>
                  <FieldLabel first label="Date" />
                  <PickerField
                    accessibilityLabel={`Date, ${friendlyDate(date)}`}
                    hint="Tap to open calendar"
                    icon="calendar-outline"
                    onPress={() => setOpenPicker('date')}
                    value={friendlyDate(date)}
                  />
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: allDay }}
                    onPress={() => setAllDay((value) => !value)}
                    style={styles.switchRow}
                  >
                    <View style={styles.switchCopy}>
                      <Text style={styles.switchTitle}>All-day event</Text>
                      <Text style={styles.switchBody}>Keep the whole date reserved</Text>
                    </View>
                    <AnimatedSwitch value={allDay} />
                  </Pressable>
                  {!allDay ? (
                    <Reveal distance={6} style={styles.timeRow}>
                      <View style={styles.timeField}>
                        <FieldLabel first label="Start" />
                        <PickerField
                          accessibilityLabel={`Start time, ${friendlyTime(date, startTime)}`}
                          icon="time-outline"
                          onPress={() => setOpenPicker('start')}
                          value={friendlyTime(date, startTime)}
                        />
                      </View>
                      <View style={styles.timeField}>
                        <FieldLabel first label="End" />
                        <PickerField
                          accessibilityLabel={`End time, ${friendlyTime(date, endTime)}`}
                          icon="time-outline"
                          onPress={() => setOpenPicker('end')}
                          value={friendlyTime(date, endTime)}
                        />
                      </View>
                    </Reveal>
                  ) : null}
                </Reveal>

                <SectionTitle subtitle="Make it easy to recognize" title="Category" />
                <View style={styles.categoryGrid}>
                  {CATEGORIES.map((option) => {
                    const active = category === option.value;
                    return (
                      <PressableScale
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        key={option.value}
                        onPress={() => setCategory(option.value)}
                        scaleTo={0.94}
                        style={[styles.categoryChip, active && styles.categoryChipActive]}
                      >
                        <Ionicons color={active ? COLORS.primary : COLORS.muted} name={option.icon} size={17} />
                        <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{option.label}</Text>
                      </PressableScale>
                    );
                  })}
                </View>

                <SectionTitle subtitle="Keep critical plans visible" title="Priority" />
                <PressableScale
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isImportant }}
                  onPress={() => setIsImportant((current) => !current)}
                  scaleTo={0.985}
                  style={[styles.importantCard, isImportant && styles.importantCardActive]}
                >
                  <View style={[styles.importantIcon, isImportant && styles.importantIconActive]}>
                    <Ionicons color={isImportant ? ON_PRIMARY : COLORS.orange} name="star" size={21} />
                  </View>
                  <View style={styles.importantCopy}>
                    <Text style={[styles.importantTitle, isImportant && styles.importantTitleActive]}>Important event</Text>
                    <Text style={styles.importantBody}>Pins this event in the group widget with a days-left countdown until it ends.</Text>
                  </View>
                  <AnimatedSwitch activeColor={COLORS.orange} value={isImportant} />
                </PressableScale>

                <SectionTitle subtitle="Control what the group sees" title="Privacy and color" />
                <Reveal style={styles.formCard}>
                  <View style={styles.visibilityRow}>
                    {(['group', 'private'] as const).map((option) => {
                      const active = visibility === option;
                      return (
                        <ChoiceCard
                          active={active}
                          body={option === 'group' ? 'Visible to all members' : 'Only visible to you'}
                          icon={<Ionicons color={active ? COLORS.primary : COLORS.muted} name={option === 'group' ? 'people-outline' : 'lock-closed-outline'} size={20} />}
                          key={option}
                          onPress={() => setVisibility(option)}
                          title={option === 'group' ? 'Group event' : 'Private event'}
                        />
                      );
                    })}
                  </View>
                  <FieldLabel label="Event color" />
                  <View style={styles.colorRow}>
                    {EVENT_COLORS.map((option, index) => {
                      const active = color === option;
                      return (
                        <PressableScale
                          accessibilityLabel={`Color ${index + 1}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          key={option}
                          onPress={() => setColor(option)}
                          scaleTo={0.9}
                          style={[styles.colorOption, { backgroundColor: option }, active && styles.colorOptionActive]}
                        >
                          {active ? <Ionicons color="#FFFFFF" name="checkmark" size={18} /> : null}
                        </PressableScale>
                      );
                    })}
                  </View>
                </Reveal>

                <SectionTitle subtitle="Choose whether Planado keeps it in your history" title="After the event" />
                <View style={styles.retentionRow}>
                  {([
                    {
                      value: 'permanent' as const,
                      icon: 'archive-outline' as const,
                      title: 'Keep in history',
                      body: 'Stays on your calendar until it is manually deleted.',
                    },
                    {
                      value: 'temporary' as const,
                      icon: 'timer-outline' as const,
                      title: 'Temporary',
                      body: 'Automatically deleted 7 days after it ends.',
                    },
                  ]).map((option) => {
                    const active = retention === option.value;
                    return (
                      <PressableScale
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        key={option.value}
                        onPress={() => setRetention(option.value)}
                        scaleTo={0.985}
                        style={[styles.retentionCard, active && styles.retentionCardActive]}
                      >
                        <View style={[styles.retentionIcon, active && styles.retentionIconActive]}>
                          <Ionicons color={active ? COLORS.primary : COLORS.muted} name={option.icon} size={20} />
                        </View>
                        <View style={styles.retentionCopy}>
                          <Text style={[styles.retentionTitle, active && styles.retentionTitleActive]}>{option.title}</Text>
                          <Text style={styles.retentionBody}>{option.body}</Text>
                        </View>
                        <Ionicons
                          color={active ? COLORS.primary : COLORS.faint}
                          name={active ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                        />
                      </PressableScale>
                    );
                  })}
                </View>

                <Button
                  icon="checkmark-circle-outline"
                  label={saving ? 'Creating event…' : 'Create event'}
                  loading={saving}
                  onPress={() => void submit()}
                  style={styles.submitButton}
                />
              </>
            )}
          </View>
        </ScrollView>
        <PlanadoDateTimePicker
          mode={openPicker === 'date' ? 'date' : 'time'}
          onClose={() => setOpenPicker(null)}
          onConfirm={confirmPicker}
          relativeTo={openPicker === 'end' ? parseLocalDateTime(date, startTime) ?? undefined : undefined}
          title={openPicker === 'date' ? 'Event date' : openPicker === 'end' ? 'End time' : 'Start time'}
          value={currentPickerValue()}
          visible={openPicker !== null}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function FieldLabel({ count, first, label }: { count?: string; first?: boolean; label: string }) {
  return (
    <View style={[styles.labelRow, first && styles.labelRowFirst]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {count ? <Text style={styles.fieldCount}>{count}</Text> : null}
    </View>
  );
}

function PickerField({
  accessibilityLabel,
  hint,
  icon,
  onPress,
  value,
}: {
  accessibilityLabel: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  value: string;
}) {
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.inputShell, pressed && styles.inputShellPressed]}
    >
      <Ionicons color={COLORS.primary} name={icon} size={18} />
      <View style={styles.pickerFieldCopy}>
        <Text numberOfLines={1} style={styles.pickerFieldValue}>{value}</Text>
        {hint ? <Text style={styles.pickerFieldHint}>{hint}</Text> : null}
      </View>
      <Ionicons color={COLORS.muted} name="chevron-down" size={17} />
    </Pressable>
  );
}

function ChoiceCard({
  active,
  body,
  icon,
  onPress,
  title,
}: {
  active: boolean;
  body: string;
  icon: ReactNode;
  onPress: () => void;
  title: string;
}) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      scaleTo={0.97}
      style={[styles.visibilityCard, active && styles.visibilityCardActive]}
    >
      {icon}
      <Text style={[styles.visibilityTitle, active && styles.visibilityTitleActive]}>{title}</Text>
      <Text style={styles.visibilityBody}>{body}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 44 },
  page: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter },
  heroCard: {
    minHeight: 100,
    marginTop: 4,
    padding: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: RADIUS.xl,
    boxShadow: SHADOW.md,
  },
  heroIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: RADIUS.md,
  },
  heroCopy: { flex: 1 },
  heroEyebrow: { ...TYPE.overline, color: '#C9CAFF' },
  heroTitle: { ...TYPE.headline, marginTop: 2, color: '#FFFFFF', fontWeight: '800' },
  heroBody: { ...TYPE.subhead, marginTop: 2, color: 'rgba(255,255,255,0.82)' },
  emptyGroups: { marginTop: 20 },
  sectionHeader: { marginTop: 28, marginBottom: 12 },
  sectionTitle: { ...TYPE.title3, color: COLORS.ink },
  sectionSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  formCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  labelRow: { marginTop: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  labelRowFirst: { marginTop: 0 },
  fieldLabel: { ...TYPE.subhead, color: COLORS.ink, fontWeight: '700' },
  fieldCount: { ...TYPE.footnote, color: COLORS.muted },
  inputShell: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.input,
  },
  inputShellPressed: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  input: { ...TYPE.body, flex: 1, paddingVertical: 12, color: COLORS.ink },
  pickerFieldCopy: { flex: 1, paddingVertical: 10 },
  pickerFieldValue: { ...TYPE.bodyStrong, color: COLORS.ink },
  pickerFieldHint: { ...TYPE.footnote, marginTop: 1, color: COLORS.muted },
  textAreaShell: { minHeight: 104, alignItems: 'flex-start' },
  textArea: { minHeight: 96 },
  groupScroller: { marginHorizontal: -PAGE.gutter },
  groupRow: { paddingHorizontal: PAGE.gutter, gap: 8 },
  groupChip: {
    maxWidth: 220,
    minHeight: 44,
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
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupChipText: { ...TYPE.callout, flexShrink: 1, color: COLORS.ink, fontWeight: '600' },
  groupChipTextActive: { color: ON_PRIMARY, fontWeight: '700' },
  switchRow: { minHeight: 68, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1 },
  switchTitle: { ...TYPE.bodyStrong, color: COLORS.ink },
  switchBody: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  timeRow: { marginTop: 4, flexDirection: 'row', gap: 10 },
  timeField: { flex: 1 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
  },
  categoryChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  categoryText: { ...TYPE.callout, color: COLORS.ink, fontWeight: '600' },
  categoryTextActive: { color: COLORS.primary, fontWeight: '700' },
  importantCard: {
    minHeight: 96,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  importantCardActive: { borderColor: COLORS.orange, backgroundColor: COLORS.orangeSoft },
  importantIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.orangeSoft },
  importantIconActive: { backgroundColor: COLORS.orange },
  importantCopy: { flex: 1 },
  importantTitle: { ...TYPE.bodyStrong, color: COLORS.ink },
  importantTitleActive: { color: COLORS.orange },
  importantBody: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  visibilityRow: { flexDirection: 'row', gap: 10 },
  visibilityCard: {
    flex: 1,
    minHeight: 108,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.input,
  },
  visibilityCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  visibilityTitle: { ...TYPE.callout, marginTop: 10, color: COLORS.ink, fontWeight: '700' },
  visibilityTitleActive: { color: COLORS.primary },
  visibilityBody: { ...TYPE.footnote, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorOption: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.surface, borderRadius: 22 },
  colorOptionActive: { borderColor: COLORS.primarySoft, boxShadow: SHADOW.sm },
  retentionRow: { gap: 10 },
  retentionCard: {
    minHeight: 84,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  retentionCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  retentionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.elevatedStrong },
  retentionIconActive: { backgroundColor: COLORS.surface },
  retentionCopy: { flex: 1 },
  retentionTitle: { ...TYPE.bodyStrong, color: COLORS.ink },
  retentionTitleActive: { color: COLORS.primary },
  retentionBody: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  submitButton: { marginTop: 28 },
});
