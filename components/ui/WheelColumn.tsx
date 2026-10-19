import { useEffect, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';

import { COLORS } from '../../theme/colors';

/** Row height: Android's 48dp touch target. */
export const WHEEL_ROW = 48;
export const WHEEL_ROWS = 5;
/** Offset of the selection band from the top of a wheel. */
export const WHEEL_BAND_TOP = WHEEL_ROW * Math.floor(WHEEL_ROWS / 2);

/** Looping wheels repeat their rows; the wheel always comes to rest in the middle copy. */
const LOOP_COPIES = 3;
const MIDDLE_COPY = Math.floor(LOOP_COPIES / 2);
const SETTLE_DELAY = 160;

export type WheelOption = { label: string; spoken?: string };

function mod(value: number, size: number) {
  return ((value % size) + size) % size;
}

/** The copy of `valueIndex` closest to `current`, so the wheel turns the short way. */
function nearestRow(current: number, valueIndex: number, count: number, total: number) {
  const base = current - mod(current, count) + valueIndex;
  return [base - count, base, base + count]
    .filter((row) => row >= 0 && row < total)
    .reduce((best, row) => (Math.abs(row - current) < Math.abs(best - current) ? row : best));
}

type WheelColumnProps = {
  /** Smaller type, for short columns such as AM/PM. */
  compact?: boolean;
  label: string;
  loop?: boolean;
  onChange: (index: number, direction: 1 | -1) => void;
  options: WheelOption[];
  selectedIndex: number;
  width: number;
};

/**
 * One drum of a wheel picker. Rows snap into a selection band; the band shows a
 * second, larger copy of the rows that moves with the scroll offset on the UI
 * thread, so the highlight tracks the finger without re-rendering anything.
 * The value commits when the wheel settles. Screen readers get an adjustable
 * control: swipe up or down to step.
 */
export function WheelColumn({
  compact = false,
  label,
  loop = false,
  onChange,
  options,
  selectedIndex,
  width,
}: WheelColumnProps) {
  const count = options.length;
  const total = loop ? count * LOOP_COPIES : count;
  const reduceMotion = useReducedMotion();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [initialRow] = useState(() => (loop ? MIDDLE_COPY * count : 0) + selectedIndex);
  const restingRow = useRef(initialRow);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollY = useSharedValue(initialRow * WHEEL_ROW);
  const rows = Array.from({ length: total }, (_, row) => options[row % count]);

  useEffect(() => {
    const timer = settleTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // The value changed from outside (a shortcut, another wheel): turn to it.
  useEffect(() => {
    if (mod(restingRow.current, count) === selectedIndex) return;
    const target = loop ? nearestRow(restingRow.current, selectedIndex, count, total) : selectedIndex;
    restingRow.current = target;
    scrollRef.current?.scrollTo({ y: target * WHEEL_ROW, animated: !reduceMotion });
  }, [count, loop, reduceMotion, scrollRef, selectedIndex, total]);

  const onNativeScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  const lensStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.get() }],
  }));

  function clearSettle() {
    if (!settleTimer.current) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = null;
  }

  function scheduleSettle(delay = SETTLE_DELAY) {
    clearSettle();
    settleTimer.current = setTimeout(() => settle(scrollY.get()), delay);
  }

  function scrollToRow(row: number, animated: boolean) {
    restingRow.current = row;
    scrollRef.current?.scrollTo({ y: row * WHEEL_ROW, animated });
  }

  function commit(valueIndex: number) {
    if (valueIndex === selectedIndex) return;
    const delta = loop
      ? mod(valueIndex - selectedIndex + count / 2, count) - count / 2
      : valueIndex - selectedIndex;
    onChange(valueIndex, delta >= 0 ? 1 : -1);
  }

  function settle(offset: number) {
    clearSettle();
    const row = Math.min(Math.max(Math.round(offset / WHEEL_ROW), 0), total - 1);
    const valueIndex = mod(row, count);
    const resting = loop ? MIDDLE_COPY * count + valueIndex : row;
    // Same rows in every copy, so hopping back to the middle copy is invisible.
    if (resting !== row) scrollToRow(resting, false);
    else if (Math.abs(offset - row * WHEEL_ROW) > 0.5) scrollToRow(row, !reduceMotion);
    else restingRow.current = row;
    commit(valueIndex);
  }

  function select(row: number) {
    clearSettle();
    scrollToRow(row, !reduceMotion);
    commit(mod(row, count));
  }

  function step(delta: 1 | -1) {
    const valueIndex = loop
      ? mod(selectedIndex + delta, count)
      : Math.min(Math.max(selectedIndex + delta, 0), count - 1);
    if (valueIndex === selectedIndex) return;
    select(loop ? nearestRow(restingRow.current, valueIndex, count, total) : valueIndex);
  }

  function onWebScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollY.set(event.nativeEvent.contentOffset.y);
    scheduleSettle(120);
  }

  const current = options[selectedIndex];

  return (
    <View
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityValue={{ text: current?.spoken ?? current?.label }}
      accessible
      onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={[styles.column, { width }]}
    >
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        contentOffset={{ x: 0, y: initialRow * WHEEL_ROW }}
        decelerationRate="fast"
        onMomentumScrollBegin={clearSettle}
        onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.y)}
        onScroll={Platform.OS === 'web' ? onWebScroll : onNativeScroll}
        onScrollBeginDrag={clearSettle}
        onScrollEndDrag={() => scheduleSettle()}
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ROW}
      >
        {rows.map((option, row) => (
          <Pressable key={row} onPress={() => select(row)} style={styles.row}>
            <Text style={[styles.text, compact && styles.textCompact]}>{option.label}</Text>
          </Pressable>
        ))}
      </Animated.ScrollView>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.lens}
      >
        <Animated.View style={lensStyle}>
          {rows.map((option, row) => (
            <View key={row} style={styles.row}>
              <Text style={[styles.selectedText, compact && styles.selectedTextCompact]}>{option.label}</Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { height: WHEEL_ROW * WHEEL_ROWS },
  content: { paddingVertical: WHEEL_BAND_TOP },
  row: { height: WHEEL_ROW, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 20, lineHeight: 26, fontWeight: '600', color: COLORS.muted, fontVariant: ['tabular-nums'] },
  textCompact: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  lens: {
    position: 'absolute',
    top: WHEEL_BAND_TOP,
    right: 0,
    left: 0,
    height: WHEEL_ROW,
    overflow: 'hidden',
    backgroundColor: COLORS.primarySoft,
  },
  selectedText: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: COLORS.primary, fontVariant: ['tabular-nums'] },
  selectedTextCompact: { fontSize: 18, lineHeight: 24 },
});
