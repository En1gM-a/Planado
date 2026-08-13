import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '../../hooks/useAuth';
import {
  createEvent,
  getMyCalendarGroups,
  type CalendarGroup,
  type EventCategory,
} from '../../services/eventService';

type RetentionChoice = 'permanent' | 'temporary';
type OpenPicker = 'date' | 'start' | 'end' | null;

const COLORS = {
  background: '#F6F6FB',
  surface: '#FFFFFF',
  ink: '#202027',
  muted: '#777782',
  faint: '#A1A1AC',
  line: '#E7E7EF',
  primary: '#5B5CE2',
  primarySoft: '#EEEEFF',
  green: '#24966B',
  greenSoft: '#E9F8F1',
  orange: '#DF823C',
  orangeSoft: '#FFF2E7',
  red: '#C9525C',
  redSoft: '#FFF0F1',
};

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
    if (openPicker === 'start') setStartTime(timeInputValue(value));
    if (openPicker === 'end') setEndTime(timeInputValue(value));
  }

  if (authLoading || loadingGroups) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingPage}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>Preparing your event...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.page}>
            <View style={styles.header}>
              <Pressable onPress={() => router.back()} style={styles.headerButton}>
                <Ionicons color={COLORS.ink} name="arrow-back" size={21} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>PLAN SOMETHING TOGETHER</Text>
                <Text style={styles.headerTitle}>Create event</Text>
              </View>
              <View style={[styles.headerButton, styles.headerSpark]}>
                <Ionicons color={COLORS.primary} name="sparkles" size={19} />
              </View>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroGlow} />
              <View style={[styles.heroIcon, { backgroundColor: color }]}>
                <Ionicons color="#FFFFFF" name="calendar-outline" size={24} />
              </View>
              <View style={styles.heroCopy}>
                <Text numberOfLines={1} style={styles.heroTitle}>{title.trim() || 'Your next plan'}</Text>
                <Text style={styles.heroBody}>{date} · {allDay ? 'All day' : `${startTime} – ${endTime}`}</Text>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons color={COLORS.red} name="alert-circle" size={17} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {!groups.length ? (
              <View style={styles.emptyGroups}>
                <Ionicons color={COLORS.primary} name="people-outline" size={28} />
                <Text style={styles.emptyGroupsTitle}>Create or join a group first</Text>
                <Text style={styles.emptyGroupsBody}>Every Planado event belongs to a planning space, even when its visibility is private.</Text>
                <Pressable onPress={() => router.replace('/(tabs)/groups' as Href)} style={styles.emptyGroupsButton}>
                  <Text style={styles.emptyGroupsButtonText}>Go to groups</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <SectionTitle title="Event details" subtitle="The essentials everyone needs" />
                <View style={styles.formCard}>
                  <FieldLabel label="TITLE" count={`${title.length}/120`} />
                  <View style={styles.inputShell}>
                    <Ionicons color={COLORS.faint} name="create-outline" size={18} />
                    <TextInput maxLength={120} onChangeText={setTitle} placeholder="Study session" placeholderTextColor="#AEAEB8" style={styles.input} value={title} />
                  </View>
                  <FieldLabel label="LOCATION" count={`${location.length}/300`} />
                  <View style={styles.inputShell}>
                    <Ionicons color={COLORS.faint} name="location-outline" size={18} />
                    <TextInput maxLength={300} onChangeText={setLocation} placeholder="Library, room, or link" placeholderTextColor="#AEAEB8" style={styles.input} value={location} />
                  </View>
                  <FieldLabel label="DESCRIPTION" count={`${description.length}/5000`} />
                  <View style={[styles.inputShell, styles.textAreaShell]}>
                    <TextInput maxLength={5000} multiline onChangeText={setDescription} placeholder="Add notes, what to bring, or an agenda..." placeholderTextColor="#AEAEB8" style={[styles.input, styles.textArea]} textAlignVertical="top" value={description} />
                  </View>
                </View>

                <SectionTitle title="Planning space" subtitle="Choose who this belongs to" />
                <ScrollView contentContainerStyle={styles.groupRow} horizontal showsHorizontalScrollIndicator={false}>
                  {groups.map((group) => {
                    const active = group.id === groupId;
                    return (
                      <Pressable key={group.id} onPress={() => chooseGroup(group)} style={[styles.groupChip, active && styles.groupChipActive]}>
                        <View style={[styles.groupDot, { backgroundColor: active ? '#FFFFFF' : group.color }]} />
                        <Text numberOfLines={1} style={[styles.groupChipText, active && styles.groupChipTextActive]}>{group.name}</Text>
                        {active ? <Ionicons color="#FFFFFF" name="checkmark" size={14} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <SectionTitle title="When" subtitle="Use your local date and time" />
                <View style={styles.formCard}>
                  <FieldLabel label="DATE" />
                  <Pressable onPress={() => setOpenPicker('date')} style={({ pressed }) => [styles.inputShell, pressed && styles.inputShellPressed]}>
                    <Ionicons color={COLORS.primary} name="calendar-outline" size={18} />
                    <View style={styles.pickerFieldCopy}>
                      <Text style={styles.pickerFieldValue}>{friendlyDate(date)}</Text>
                      <Text style={styles.pickerFieldHint}>Tap to open calendar</Text>
                    </View>
                    <Ionicons color={COLORS.faint} name="chevron-down" size={17} />
                  </Pressable>
                  <Pressable onPress={() => setAllDay((value) => !value)} style={styles.switchRow}>
                    <View style={styles.switchCopy}>
                      <Text style={styles.switchTitle}>All-day event</Text>
                      <Text style={styles.switchBody}>Keep the whole date reserved</Text>
                    </View>
                    <View style={[styles.switchTrack, allDay && styles.switchTrackActive]}>
                      <View style={[styles.switchThumb, allDay && styles.switchThumbActive]} />
                    </View>
                  </Pressable>
                  {!allDay ? (
                    <View style={styles.timeRow}>
                      <View style={styles.timeField}>
                        <FieldLabel label="START" />
                        <Pressable onPress={() => setOpenPicker('start')} style={({ pressed }) => [styles.inputShell, pressed && styles.inputShellPressed]}>
                          <Ionicons color={COLORS.primary} name="time-outline" size={18} />
                          <Text style={styles.pickerFieldValue}>{friendlyTime(date, startTime)}</Text>
                          <Ionicons color={COLORS.faint} name="chevron-down" size={16} />
                        </Pressable>
                      </View>
                      <View style={styles.timeField}>
                        <FieldLabel label="END" />
                        <Pressable onPress={() => setOpenPicker('end')} style={({ pressed }) => [styles.inputShell, pressed && styles.inputShellPressed]}>
                          <Ionicons color={COLORS.primary} name="time-outline" size={18} />
                          <Text style={styles.pickerFieldValue}>{friendlyTime(date, endTime)}</Text>
                          <Ionicons color={COLORS.faint} name="chevron-down" size={16} />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>

                <SectionTitle title="Category" subtitle="Make it easy to recognize" />
                <View style={styles.categoryGrid}>
                  {CATEGORIES.map((option) => {
                    const active = category === option.value;
                    return (
                      <Pressable key={option.value} onPress={() => setCategory(option.value)} style={[styles.categoryChip, active && styles.categoryChipActive]}>
                        <Ionicons color={active ? COLORS.primary : COLORS.muted} name={option.icon} size={17} />
                        <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <SectionTitle title="Privacy and color" subtitle="Control what the group sees" />
                <View style={styles.formCard}>
                  <View style={styles.visibilityRow}>
                    {(['group', 'private'] as const).map((option) => {
                      const active = visibility === option;
                      return (
                        <Pressable key={option} onPress={() => setVisibility(option)} style={[styles.visibilityCard, active && styles.visibilityCardActive]}>
                          <Ionicons color={active ? COLORS.primary : COLORS.muted} name={option === 'group' ? 'people-outline' : 'lock-closed-outline'} size={20} />
                          <Text style={[styles.visibilityTitle, active && styles.visibilityTitleActive]}>{option === 'group' ? 'Group event' : 'Private event'}</Text>
                          <Text style={styles.visibilityBody}>{option === 'group' ? 'Visible to all members' : 'Only visible to you'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <FieldLabel label="EVENT COLOR" />
                  <View style={styles.colorRow}>
                    {EVENT_COLORS.map((option) => (
                      <Pressable key={option} onPress={() => setColor(option)} style={[styles.colorOption, { backgroundColor: option }, color === option && styles.colorOptionActive]}>
                        {color === option ? <Ionicons color="#FFFFFF" name="checkmark" size={17} /> : null}
                      </Pressable>
                    ))}
                  </View>
                </View>

                <SectionTitle title="After the event" subtitle="Choose whether Planado keeps it in your history" />
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
                      <Pressable
                        key={option.value}
                        onPress={() => setRetention(option.value)}
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
                          size={20}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable disabled={saving} onPress={() => void submit()} style={({ pressed }) => [styles.submitButton, saving && styles.submitButtonDisabled, pressed && styles.pressed]}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons color="#FFFFFF" name="checkmark-circle-outline" size={21} />}
                  <Text style={styles.submitButtonText}>{saving ? 'Creating event...' : 'Create event'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
        <PlanadoDateTimePicker
          mode={openPicker === 'date' ? 'date' : 'time'}
          onClose={() => setOpenPicker(null)}
          onConfirm={confirmPicker}
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
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function FieldLabel({ label, count }: { label: string; count?: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {count ? <Text style={styles.fieldCount}>{count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 44 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18 },
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: COLORS.muted, fontSize: 10 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  headerSpark: { backgroundColor: COLORS.primarySoft },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  headerTitle: { marginTop: 3, color: COLORS.ink, fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  heroCard: { minHeight: 94, padding: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 23, backgroundColor: '#292953' },
  heroGlow: { position: 'absolute', width: 140, height: 140, top: -80, right: -25, borderRadius: 70, backgroundColor: '#686AD6', opacity: 0.5 },
  heroIcon: { width: 49, height: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  heroCopy: { flex: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  heroBody: { marginTop: 5, color: '#C7C7E2', fontSize: 9 },
  errorBanner: { marginTop: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: COLORS.redSoft },
  errorText: { flex: 1, color: '#9F4148', fontSize: 9, lineHeight: 14 },
  sectionHeader: { marginTop: 24, marginBottom: 10 },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '900' },
  sectionSubtitle: { marginTop: 3, color: COLORS.faint, fontSize: 9 },
  formCard: { padding: 15, borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  labelRow: { marginTop: 14, marginBottom: 7, flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { color: '#6F6F7A', fontSize: 8, fontWeight: '900', letterSpacing: 0.75 },
  fieldCount: { color: COLORS.faint, fontSize: 7 },
  inputShell: { minHeight: 50, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#DEDEE8', borderRadius: 15, backgroundColor: '#FAFAFD' },
  inputShellPressed: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  input: { flex: 1, paddingVertical: 11, color: COLORS.ink, fontSize: 11 },
  pickerFieldCopy: { flex: 1, paddingVertical: 9 },
  pickerFieldValue: { flex: 1, color: COLORS.ink, fontSize: 10, fontWeight: '800' },
  pickerFieldHint: { marginTop: 2, color: COLORS.faint, fontSize: 7 },
  textAreaShell: { minHeight: 100, alignItems: 'flex-start' },
  textArea: { minHeight: 95, lineHeight: 17 },
  groupRow: { gap: 8 },
  groupChip: { maxWidth: 210, minHeight: 43, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  groupChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  groupDot: { width: 9, height: 9, borderRadius: 5 },
  groupChipText: { flexShrink: 1, color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  groupChipTextActive: { color: '#FFFFFF' },
  switchRow: { minHeight: 66, marginTop: 14, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center' },
  switchCopy: { flex: 1 },
  switchTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  switchBody: { marginTop: 3, color: COLORS.muted, fontSize: 8 },
  switchTrack: { width: 44, height: 26, padding: 3, justifyContent: 'center', borderRadius: 13, backgroundColor: '#DCDCE4' },
  switchTrackActive: { backgroundColor: COLORS.primary },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  switchThumbActive: { alignSelf: 'flex-end' },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeField: { flex: 1 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  categoryChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  categoryText: { color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  categoryTextActive: { color: COLORS.primary },
  visibilityRow: { flexDirection: 'row', gap: 9 },
  visibilityCard: { flex: 1, minHeight: 103, padding: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 17, backgroundColor: '#FAFAFD' },
  visibilityCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  visibilityTitle: { marginTop: 9, color: COLORS.ink, fontSize: 10, fontWeight: '900' },
  visibilityTitleActive: { color: COLORS.primary },
  visibilityBody: { marginTop: 3, color: COLORS.muted, fontSize: 7, lineHeight: 11 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.surface, borderRadius: 14 },
  colorOptionActive: { borderColor: '#D5D5DF', transform: [{ scale: 1.08 }] },
  retentionRow: { gap: 9 },
  retentionCard: { minHeight: 82, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, backgroundColor: COLORS.surface },
  retentionCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  retentionIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#F2F2F7' },
  retentionIconActive: { backgroundColor: '#FFFFFF' },
  retentionCopy: { flex: 1 },
  retentionTitle: { color: COLORS.ink, fontSize: 10, fontWeight: '900' },
  retentionTitleActive: { color: COLORS.primary },
  retentionBody: { marginTop: 4, color: COLORS.muted, fontSize: 8, lineHeight: 12 },
  submitButton: { minHeight: 55, marginTop: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: COLORS.primary },
  submitButtonDisabled: { opacity: 0.65 },
  submitButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  emptyGroups: { marginTop: 20, padding: 25, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 23, backgroundColor: COLORS.surface },
  emptyGroupsTitle: { marginTop: 12, color: COLORS.ink, fontSize: 15, fontWeight: '900' },
  emptyGroupsBody: { maxWidth: 340, marginTop: 6, color: COLORS.muted, fontSize: 9, lineHeight: 15, textAlign: 'center' },
  emptyGroupsButton: { minHeight: 43, marginTop: 16, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.primary },
  emptyGroupsButtonText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
});
