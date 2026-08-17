import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS } from '../theme/colors';

type PickerMode = 'date' | 'time';

type PlanadoDateTimePickerProps = {
  mode: PickerMode;
  onClose: () => void;
  onConfirm: (value: Date) => void;
  title: string;
  value: Date;
  visible: boolean;
};

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const CLOCK_SIZE = 228;
const CLOCK_CENTER = CLOCK_SIZE / 2;
const CLOCK_RADIUS = 86;
const HOUR_SIZE = 38;

function sameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function PlanadoDateTimePicker({
  mode,
  onClose,
  onConfirm,
  title,
  value,
  visible,
}: PlanadoDateTimePickerProps) {
  const [draft, setDraft] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(value.getFullYear(), value.getMonth(), 1),
  );

  useEffect(() => {
    if (!visible) return;
    setDraft(new Date(value));
    setVisibleMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value, visible]);

  const days = useMemo(() => monthDays(visibleMonth), [visibleMonth]);

  function confirm() {
    onConfirm(new Date(draft));
    onClose();
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close picker" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons color={COLORS.primary} name={mode === 'date' ? 'calendar' : 'time'} size={22} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{mode === 'date' ? 'CHOOSE A DATE' : 'CHOOSE A TIME'}</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={COLORS.muted} name="close" size={19} />
            </Pressable>
          </View>

          <View style={styles.selectionPreview}>
            <Ionicons color={COLORS.primary} name={mode === 'date' ? 'calendar-outline' : 'alarm-outline'} size={18} />
            <Text style={styles.selectionPreviewText}>{mode === 'date' ? dateLabel(draft) : timeLabel(draft)}</Text>
          </View>

          {mode === 'date' ? (
            <CalendarPicker
              days={days}
              draft={draft}
              onChange={setDraft}
              onMonthChange={setVisibleMonth}
              visibleMonth={visibleMonth}
            />
          ) : (
            <ClockPicker draft={draft} onChange={setDraft} />
          )}

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={confirm} style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}>
              <Ionicons color="#FFFFFF" name="checkmark" size={17} />
              <Text style={styles.confirmText}>Use this {mode}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CalendarPicker({
  days,
  draft,
  onChange,
  onMonthChange,
  visibleMonth,
}: {
  days: Date[];
  draft: Date;
  onChange: (date: Date) => void;
  onMonthChange: (date: Date) => void;
  visibleMonth: Date;
}) {
  const today = new Date();

  function moveMonth(offset: number) {
    onMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1));
  }

  function chooseDate(day: Date) {
    const next = new Date(draft);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    onChange(next);
    if (day.getMonth() !== visibleMonth.getMonth()) {
      onMonthChange(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }

  return (
    <View style={styles.calendar}>
      <View style={styles.monthHeader}>
        <Pressable accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} style={styles.monthButton}>
          <Ionicons color={COLORS.ink} name="chevron-back" size={19} />
        </Pressable>
        <Text style={styles.monthTitle}>
          {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(visibleMonth)}
        </Text>
        <Pressable accessibilityLabel="Next month" onPress={() => moveMonth(1)} style={styles.monthButton}>
          <Ionicons color={COLORS.ink} name="chevron-forward" size={19} />
        </Pressable>
      </View>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}
      </View>
      <View style={styles.daysGrid}>
        {days.map((day) => {
          const selected = sameDate(day, draft);
          const isToday = sameDate(day, today);
          const outside = day.getMonth() !== visibleMonth.getMonth();
          return (
            <Pressable
              accessibilityLabel={dateLabel(day)}
              key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
              onPress={() => chooseDate(day)}
              style={[styles.day, selected && styles.daySelected]}
            >
              <Text style={[
                styles.dayText,
                outside && styles.dayTextOutside,
                isToday && !selected && styles.dayTextToday,
                selected && styles.dayTextSelected,
              ]}>
                {day.getDate()}
              </Text>
              {isToday && !selected ? <View style={styles.todayDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ClockPicker({ draft, onChange }: { draft: Date; onChange: (date: Date) => void }) {
  const hour24 = draft.getHours();
  const selectedHour = hour24 % 12 || 12;
  const isPm = hour24 >= 12;
  const minuteOptions = useMemo(() => {
    const values = new Set(Array.from({ length: 12 }, (_, index) => index * 5));
    values.add(draft.getMinutes());
    return Array.from(values).sort((left, right) => left - right);
  }, [draft]);

  function chooseHour(hour: number) {
    const next = new Date(draft);
    next.setHours((hour % 12) + (isPm ? 12 : 0));
    onChange(next);
  }

  function chooseMinute(minute: number) {
    const next = new Date(draft);
    next.setMinutes(minute);
    onChange(next);
  }

  function choosePeriod(period: 'AM' | 'PM') {
    const next = new Date(draft);
    if (period === 'PM' && next.getHours() < 12) next.setHours(next.getHours() + 12);
    if (period === 'AM' && next.getHours() >= 12) next.setHours(next.getHours() - 12);
    onChange(next);
  }

  return (
    <View style={styles.clockSection}>
      <View style={styles.periodRow}>
        {(['AM', 'PM'] as const).map((period) => {
          const active = period === (isPm ? 'PM' : 'AM');
          return (
            <Pressable key={period} onPress={() => choosePeriod(period)} style={[styles.periodButton, active && styles.periodButtonActive]}>
              <Text style={[styles.periodText, active && styles.periodTextActive]}>{period}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.clockFace}>
        <View style={styles.clockCenter} />
        <View
          style={[
            styles.clockHand,
            { transform: [{ rotate: `${selectedHour * 30}deg` }] },
          ]}
        />
        {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => {
          const angle = (hour * 30 * Math.PI) / 180;
          const left = CLOCK_CENTER + CLOCK_RADIUS * Math.sin(angle) - HOUR_SIZE / 2;
          const top = CLOCK_CENTER - CLOCK_RADIUS * Math.cos(angle) - HOUR_SIZE / 2;
          const active = hour === selectedHour;
          return (
            <Pressable
              accessibilityLabel={`${hour} o'clock`}
              key={hour}
              onPress={() => chooseHour(hour)}
              style={[styles.hourButton, { left, top }, active && styles.hourButtonActive]}
            >
              <Text style={[styles.hourText, active && styles.hourTextActive]}>{hour}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.minuteLabel}>MINUTES</Text>
      <ScrollView contentContainerStyle={styles.minuteRow} horizontal showsHorizontalScrollIndicator={false}>
        {minuteOptions.map((minute) => {
          const active = draft.getMinutes() === minute;
          return (
            <Pressable key={minute} onPress={() => chooseMinute(minute)} style={[styles.minuteButton, active && styles.minuteButtonActive]}>
              <Text style={[styles.minuteText, active && styles.minuteTextActive]}>{String(minute).padStart(2, '0')}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(24,24,35,0.62)' },
  card: { width: '100%', maxWidth: 430, maxHeight: '94%', padding: 18, borderRadius: 28, backgroundColor: COLORS.surface, shadowColor: '#171726', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.25, shadowRadius: 32, elevation: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  headerIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: COLORS.primarySoft },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.primary, fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  title: { marginTop: 3, color: COLORS.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.35 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: COLORS.elevated },
  selectionPreview: { minHeight: 48, marginTop: 16, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: COLORS.primarySoft },
  selectionPreviewText: { color: COLORS.primary, fontSize: 12, fontWeight: '900' },
  calendar: { marginTop: 12 },
  monthHeader: { minHeight: 43, flexDirection: 'row', alignItems: 'center' },
  monthButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.elevated },
  monthTitle: { flex: 1, color: COLORS.ink, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  weekdayRow: { marginTop: 8, flexDirection: 'row' },
  weekday: { width: '14.285714%', color: COLORS.faint, fontSize: 7, fontWeight: '900', textAlign: 'center', letterSpacing: 0.45 },
  daysGrid: { marginTop: 5, flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285714%', height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  daySelected: { backgroundColor: COLORS.primary },
  dayText: { color: COLORS.ink, fontSize: 10, fontWeight: '800' },
  dayTextOutside: { color: COLORS.faint },
  dayTextToday: { color: COLORS.primary },
  dayTextSelected: { color: '#FFFFFF' },
  todayDot: { position: 'absolute', bottom: 5, width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.primary },
  clockSection: { alignItems: 'center' },
  periodRow: { marginTop: 13, flexDirection: 'row', gap: 8 },
  periodButton: { width: 64, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: COLORS.input },
  periodButtonActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  periodText: { color: COLORS.muted, fontSize: 9, fontWeight: '900' },
  periodTextActive: { color: '#FFFFFF' },
  clockFace: { width: CLOCK_SIZE, height: CLOCK_SIZE, marginTop: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: CLOCK_SIZE / 2, backgroundColor: COLORS.input },
  clockCenter: { position: 'absolute', zIndex: 2, left: CLOCK_CENTER - 4, top: CLOCK_CENTER - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  clockHand: { position: 'absolute', zIndex: 1, left: CLOCK_CENTER - 1, top: 35, width: 2, height: CLOCK_CENTER - 35, backgroundColor: '#BDBDFA', transformOrigin: 'bottom' },
  hourButton: { position: 'absolute', zIndex: 3, width: HOUR_SIZE, height: HOUR_SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: HOUR_SIZE / 2 },
  hourButtonActive: { backgroundColor: COLORS.primary },
  hourText: { color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  hourTextActive: { color: '#FFFFFF' },
  minuteLabel: { alignSelf: 'flex-start', marginTop: 10, color: COLORS.faint, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  minuteRow: { paddingTop: 7, gap: 7 },
  minuteButton: { width: 42, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: COLORS.input },
  minuteButtonActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  minuteText: { color: COLORS.muted, fontSize: 9, fontWeight: '900' },
  minuteTextActive: { color: COLORS.primary },
  actions: { marginTop: 18, flexDirection: 'row', gap: 9 },
  cancelButton: { flex: 1, minHeight: 47, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, backgroundColor: COLORS.elevated },
  cancelText: { color: COLORS.muted, fontSize: 10, fontWeight: '900' },
  confirmButton: { flex: 1.35, minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 15, backgroundColor: COLORS.primary },
  confirmText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
});
