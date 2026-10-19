import Ionicons from '@expo/vector-icons/Ionicons';
import { MotiText, MotiView } from 'moti';
import { type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';

import { usePlanadoTheme } from '../hooks/usePlanadoTheme';
import { COLORS, DARK_PALETTE, LIGHT_PALETTE } from '../theme/colors';
import { gradientStyle, MOTION, ON_PRIMARY, RADIUS, SHADOW, TYPE } from '../theme/tokens';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { ModalCard } from './ui/motion';
import { PressableScale } from './ui/PressableScale';
import { SelectionFill } from './ui/SelectionFill';
import { WHEEL_BAND_TOP, WHEEL_ROW, WHEEL_ROWS, WheelColumn, type WheelOption } from './ui/WheelColumn';

type PickerMode = 'date' | 'time';
type IconName = keyof typeof Ionicons.glyphMap;
type TimePart = 'hour' | 'minute' | 'period';

type PlanadoDateTimePickerProps = {
  confirmLabel?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  mode: PickerMode;
  onClose: () => void;
  onConfirm: (value: Date) => void;
  /** For an end time: the start it is measured from. Adds duration shortcuts. */
  relativeTo?: Date;
  title: string;
  value: Date;
  visible: boolean;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MINUTE_MS = 60 * 1000;
const DURATIONS = [30, 60, 90, 120, 180];
const HOUR_OPTIONS: WheelOption[] = Array.from({ length: 12 }, (_, index) => ({ label: String(index || 12) }));
const PERIOD_OPTIONS: WheelOption[] = [{ label: 'AM' }, { label: 'PM' }];

function sameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function dateOnlyValue(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** Five-minute steps, plus any odd minute already in play so it is never rounded away. */
function minuteStops(value: Date, relativeTo?: Date) {
  const stops = new Set(Array.from({ length: 12 }, (_, index) => index * 5));
  stops.add(value.getMinutes());
  if (relativeTo) {
    stops.add(relativeTo.getMinutes());
    stops.add((relativeTo.getMinutes() + 30) % 60);
  }
  return Array.from(stops).sort((left, right) => left - right);
}

function withPart(date: Date, part: TimePart, index: number, minutes: number[]) {
  const next = new Date(date);
  const hours = next.getHours();
  if (part === 'hour') next.setHours(index + (hours >= 12 ? 12 : 0));
  if (part === 'minute') next.setMinutes(minutes[index] ?? 0);
  if (part === 'period') next.setHours((hours % 12) + (index === 1 ? 12 : 0));
  return next;
}

export function PlanadoDateTimePicker(props: PlanadoDateTimePickerProps) {
  const { onClose, visible } = props;

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
        {/* Mounted per opening, so every control starts from the current value. */}
        {visible ? <PickerCard {...props} /> : null}
      </View>
    </Modal>
  );
}

function PickerCard({
  confirmLabel,
  maximumDate,
  minimumDate,
  mode,
  onClose,
  onConfirm,
  relativeTo,
  title,
  value,
}: PlanadoDateTimePickerProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [draft, setDraft] = useState(() => new Date(value));
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const [minutes] = useState(() => minuteStops(value, relativeTo));

  const days = useMemo(() => monthDays(visibleMonth), [visibleMonth]);
  const draftDateValue = dateOnlyValue(draft);
  const draftAllowed = mode === 'date'
    ? (!minimumDate || draftDateValue >= dateOnlyValue(minimumDate))
      && (!maximumDate || draftDateValue <= dateOnlyValue(maximumDate))
    : !relativeTo || draft.getTime() >= relativeTo.getTime();

  function confirm() {
    if (!draftAllowed) return;
    onConfirm(new Date(draft));
    onClose();
  }

  return (
    <ModalCard style={[styles.card, { width: Math.min(Math.max(windowWidth - 24, 0), 430) }]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons color={COLORS.primary} name={mode === 'date' ? 'calendar' : 'time'} size={22} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{mode === 'date' ? 'Choose a date' : 'Choose a time'}</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        </View>
        <IconButton icon="close" label="Close" onPress={onClose} tone="ghost" />
      </View>

      {mode === 'date' ? (
        <>
          <View style={styles.selectionPreview}>
            <Ionicons color={COLORS.primary} name="calendar-outline" size={18} />
            <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.selectionPreviewText}>
              {dateLabel(draft)}
            </Text>
          </View>
          <CalendarPicker
            days={days}
            draft={draft}
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            onChange={setDraft}
            onMonthChange={setVisibleMonth}
            visibleMonth={visibleMonth}
          />
        </>
      ) : (
        <TimePicker draft={draft} minutes={minutes} onChange={setDraft} relativeTo={relativeTo} />
      )}

      <View style={styles.actions}>
        <Button label="Cancel" onPress={onClose} size="md" style={styles.cancelButton} variant="secondary" />
        <Button
          disabled={!draftAllowed}
          icon="checkmark"
          label={confirmLabel ?? `Use this ${mode}`}
          onPress={confirm}
          size="md"
          style={styles.confirmButton}
        />
      </View>
    </ModalCard>
  );
}

function CalendarPicker({
  days,
  draft,
  maximumDate,
  minimumDate,
  onChange,
  onMonthChange,
  visibleMonth,
}: {
  days: Date[];
  draft: Date;
  maximumDate?: Date;
  minimumDate?: Date;
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
        <IconButton icon="chevron-back" label="Previous month" onPress={() => moveMonth(-1)} size={20} tone="ghost" />
        <Text style={styles.monthTitle}>
          {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(visibleMonth)}
        </Text>
        <IconButton icon="chevron-forward" label="Next month" onPress={() => moveMonth(1)} size={20} tone="ghost" />
      </View>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}
      </View>
      <MotiView
        animate={{ opacity: 1 }}
        from={{ opacity: 0.4 }}
        key={`${visibleMonth.getFullYear()}-${visibleMonth.getMonth()}`}
        transition={{ type: 'timing', duration: MOTION.base }}
      >
        {Array.from({ length: 6 }, (_, weekIndex) => (
          <View key={`week-${weekIndex}`} style={styles.weekRow}>
            {days.slice(weekIndex * 7, weekIndex * 7 + 7).map((day) => {
              const selected = sameDate(day, draft);
              const isToday = sameDate(day, today);
              const outside = day.getMonth() !== visibleMonth.getMonth();
              const dayValue = dateOnlyValue(day);
              const disabled = Boolean(
                (minimumDate && dayValue < dateOnlyValue(minimumDate))
                || (maximumDate && dayValue > dateOnlyValue(maximumDate)),
              );
              return (
                <Pressable
                  accessibilityLabel={dateLabel(day)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected }}
                  disabled={disabled}
                  key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                  onPress={() => chooseDate(day)}
                  style={styles.day}
                >
                  <View style={[styles.dayCircle, disabled && styles.dayDisabled]}>
                    {selected ? <SelectionFill radius={20} /> : null}
                    {isToday && !selected ? <SelectionFill radius={20} variant="ring" /> : null}
                    <Text style={[
                      styles.dayText,
                      outside && styles.dayTextOutside,
                      isToday && !selected && styles.dayTextToday,
                      selected && styles.dayTextSelected,
                    ]}>
                      {day.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </MotiView>
    </View>
  );
}

function TimePicker({
  draft,
  minutes,
  onChange,
  relativeTo,
}: {
  draft: Date;
  minutes: number[];
  onChange: Dispatch<SetStateAction<Date>>;
  relativeTo?: Date;
}) {
  const { isDark } = usePlanadoTheme();
  const [tick, setTick] = useState<{ animate: boolean; hour: 1 | -1; minute: 1 | -1 }>({
    animate: false,
    hour: 1,
    minute: 1,
  });

  const hours = draft.getHours();
  const hourIndex = hours % 12;
  const minuteIndex = Math.max(0, minutes.indexOf(draft.getMinutes()));
  const periodIndex = hours >= 12 ? 1 : 0;
  const minuteOptions = minutes.map((minute) => ({
    label: String(minute).padStart(2, '0'),
    spoken: `${minute} minutes`,
  }));
  const hourLabel = HOUR_OPTIONS[hourIndex].label;
  const minuteLabel = minuteOptions[minuteIndex]?.label ?? '00';
  const periodLabel = PERIOD_OPTIONS[periodIndex].label;

  const length = relativeTo ? Math.round((draft.getTime() - relativeTo.getTime()) / MINUTE_MS) : null;
  let caption: { icon: IconName; text: string; danger?: boolean } = { icon: 'calendar-outline', text: dateLabel(draft) };
  if (relativeTo && length !== null) {
    if (length < 0) caption = { icon: 'alert-circle', text: `Ends before the ${timeLabel(relativeTo)} start`, danger: true };
    else if (length === 0) caption = { icon: 'time-outline', text: 'Same time as the start' };
    else caption = { icon: 'hourglass-outline', text: `Lasts ${formatDuration(length)}` };
  }

  // The wheel fades out at the top and bottom edges into the card surface.
  const surface = isDark ? DARK_PALETTE.surface : LIGHT_PALETTE.surface;
  const fade = gradientStyle(
    `linear-gradient(180deg, ${surface}F2 0%, ${surface}00 36%, ${surface}00 64%, ${surface}F2 100%)`,
    'transparent',
  );

  function choose(part: TimePart, index: number, direction: 1 | -1) {
    setTick((current) => (part === 'minute'
      ? { ...current, animate: true, minute: direction }
      : { ...current, animate: true, hour: direction }));
    onChange((current) => withPart(current, part, index, minutes));
  }

  function chooseLength(target: Date) {
    const direction = target.getTime() >= draft.getTime() ? 1 : -1;
    setTick({ animate: true, hour: direction, minute: direction });
    onChange(new Date(target));
  }

  return (
    <View>
      <View
        accessibilityLabel={`${hourLabel}:${minuteLabel} ${periodLabel}. ${caption.text}`}
        accessible
        style={styles.readout}
      >
        <View style={styles.readoutTime}>
          <TickText
            animate={tick.animate}
            direction={tick.hour}
            key={`hour-${hourLabel}`}
            style={styles.readoutDigits}
            value={hourLabel}
          />
          <Text style={styles.readoutDigits}>:</Text>
          <TickText
            animate={tick.animate}
            direction={tick.minute}
            key={`minute-${minuteLabel}`}
            style={styles.readoutDigits}
            value={minuteLabel}
          />
          <TickText
            animate={tick.animate}
            direction={tick.hour}
            key={`period-${periodLabel}`}
            style={styles.readoutPeriod}
            value={periodLabel}
          />
        </View>
        <View style={styles.readoutCaption}>
          <Ionicons color={caption.danger ? COLORS.red : COLORS.muted} name={caption.icon} size={15} />
          <Text numberOfLines={1} style={[styles.readoutCaptionText, caption.danger && styles.readoutCaptionDanger]}>
            {caption.text}
          </Text>
        </View>
      </View>

      <View style={styles.wheels}>
        <View pointerEvents="none" style={styles.wheelBand} />
        <WheelColumn
          label="Hour"
          loop
          onChange={(index, direction) => choose('hour', index, direction)}
          options={HOUR_OPTIONS}
          selectedIndex={hourIndex}
          width={76}
        />
        <View importantForAccessibility="no" pointerEvents="none" style={styles.wheelColon}>
          <Text style={styles.wheelColonText}>:</Text>
        </View>
        <WheelColumn
          label="Minutes"
          loop
          onChange={(index, direction) => choose('minute', index, direction)}
          options={minuteOptions}
          selectedIndex={minuteIndex}
          width={76}
        />
        <View style={styles.wheelGap} />
        <WheelColumn
          compact
          label="AM or PM"
          onChange={(index, direction) => choose('period', index, direction)}
          options={PERIOD_OPTIONS}
          selectedIndex={periodIndex}
          width={68}
        />
        <View pointerEvents="none" style={[styles.wheelFade, fade]} />
      </View>

      {relativeTo ? (
        <View style={styles.lengths}>
          <Text style={styles.lengthsLabel}>Duration</Text>
          <View style={styles.lengthRow}>
            {DURATIONS.map((option) => {
              const target = new Date(relativeTo.getTime() + option * MINUTE_MS);
              const disabled = !sameDate(target, relativeTo);
              const active = length === option;
              return (
                <PressableScale
                  accessibilityLabel={`Lasts ${formatDuration(option)}`}
                  accessibilityState={{ disabled, selected: active }}
                  disabled={disabled}
                  key={option}
                  onPress={() => chooseLength(target)}
                  style={[styles.lengthChip, disabled && styles.lengthChipDisabled]}
                >
                  {active ? <SelectionFill color={COLORS.primarySoft} radius={RADIUS.sm} /> : null}
                  {active ? <SelectionFill radius={RADIUS.sm} variant="ring" /> : null}
                  <Text numberOfLines={1} style={[styles.lengthText, active && styles.lengthTextActive]}>
                    {option < 60 ? `${option} min` : `${option / 60} hr`}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A readout segment that rolls in from the direction the wheel turned. Keyed by
 * value at the call site, so each new value mounts fresh. `from` is read once:
 * changing it on a mounted Moti view restarts the view from there.
 */
function TickText({
  animate,
  direction,
  style,
  value,
}: {
  animate: boolean;
  direction: 1 | -1;
  style: StyleProp<TextStyle>;
  value: string;
}) {
  const [from] = useState(() => (animate ? { opacity: 0, translateY: direction * 10 } : undefined));

  return (
    <MotiText
      animate={{ opacity: 1, translateY: 0 }}
      from={from}
      style={style}
      transition={{ type: 'timing', duration: MOTION.base, easing: MOTION.easeOut }}
    >
      {value}
    </MotiText>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12, 12, 24, 0.6)' },
  card: { maxWidth: 430, maxHeight: '94%', padding: 18, borderRadius: RADIUS.xxl, backgroundColor: COLORS.surface, boxShadow: SHADOW.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  headerCopy: { flex: 1 },
  eyebrow: { ...TYPE.overline, color: COLORS.primary },
  title: { ...TYPE.title3, marginTop: 2, color: COLORS.ink },
  selectionPreview: { minHeight: 48, marginTop: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  selectionPreviewText: { ...TYPE.bodyStrong, color: COLORS.primary, fontWeight: '700' },
  calendar: { marginTop: 10 },
  monthHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  monthTitle: { ...TYPE.headline, flex: 1, color: COLORS.ink, textAlign: 'center' },
  weekdayRow: { marginTop: 6, flexDirection: 'row' },
  weekday: { ...TYPE.footnote, flex: 1, color: COLORS.muted, fontWeight: '600', textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  day: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  dayDisabled: { opacity: 0.3 },
  dayText: { ...TYPE.callout, color: COLORS.ink, fontWeight: '600' },
  dayTextOutside: { color: COLORS.faint, fontWeight: '400' },
  dayTextToday: { color: COLORS.primary, fontWeight: '800' },
  dayTextSelected: { color: ON_PRIMARY, fontWeight: '800' },
  readout: { marginTop: 14, alignItems: 'center' },
  readoutTime: { flexDirection: 'row', alignItems: 'baseline' },
  readoutDigits: { fontSize: 44, lineHeight: 52, fontWeight: '800', color: COLORS.ink, fontVariant: ['tabular-nums'] },
  readoutPeriod: { ...TYPE.headline, marginLeft: 8, color: COLORS.primary, fontWeight: '800' },
  readoutCaption: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6 },
  readoutCaptionText: { ...TYPE.subhead, color: COLORS.muted },
  readoutCaptionDanger: { color: COLORS.red, fontWeight: '700' },
  wheels: { height: WHEEL_ROW * WHEEL_ROWS, marginTop: 12, flexDirection: 'row', justifyContent: 'center' },
  wheelBand: { position: 'absolute', top: WHEEL_BAND_TOP, right: 0, left: 0, height: WHEEL_ROW, borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  wheelColon: { width: 18, alignItems: 'center', justifyContent: 'center' },
  wheelColonText: { fontSize: 26, lineHeight: 32, marginTop: -3, fontWeight: '800', color: COLORS.primary },
  wheelGap: { width: 10 },
  wheelFade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  lengths: { marginTop: 14 },
  lengthsLabel: { ...TYPE.overline, width: '100%', color: COLORS.muted },
  lengthRow: { marginTop: 8, flexDirection: 'row', gap: 8 },
  lengthChip: { flex: 1, minHeight: 44, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.sm },
  lengthChipDisabled: { opacity: 0.4 },
  lengthText: { ...TYPE.subhead, color: COLORS.ink, fontWeight: '700' },
  lengthTextActive: { color: COLORS.primary },
  actions: { marginTop: 18, flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1 },
  confirmButton: { flex: 1.4 },
});
