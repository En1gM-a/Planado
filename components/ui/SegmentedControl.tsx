import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { COLORS } from '../../theme/colors';
import { MOTION, RADIUS, SHADOW, TYPE } from '../../theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
  /** Optional count shown beside the label. */
  count?: number;
};

const INSET = 4;

/** A pill switcher whose highlight slides to the chosen option. */
export function SegmentedControl<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  value: T;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const position = useSharedValue(selectedIndex);
  const segmentWidth = trackWidth > 0 ? (trackWidth - INSET * 2) / options.length : 0;

  useEffect(() => {
    position.set(withSpring(selectedIndex, MOTION.spring));
  }, [position, selectedIndex]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: position.get() * segmentWidth }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={styles.track}
    >
      {segmentWidth > 0 ? <Animated.View style={[styles.thumb, thumbStyle]} /> : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.count === undefined ? option.label : `${option.label}, ${option.count}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={styles.segment}
          >
            {option.icon ? (
              <Ionicons color={active ? COLORS.primary : COLORS.muted} name={option.icon} size={16} />
            ) : null}
            <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <View style={[styles.count, active && styles.countActive]}>
                <Text style={[styles.countText, active && styles.countTextActive]}>{option.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    padding: INSET,
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.elevatedStrong,
  },
  thumb: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.sm,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: { ...TYPE.subhead, color: COLORS.muted, fontWeight: '600' },
  labelActive: { color: COLORS.ink, fontWeight: '700' },
  count: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.line,
  },
  countActive: { backgroundColor: COLORS.primarySoft },
  countText: { ...TYPE.footnote, color: COLORS.muted, fontWeight: '700' },
  countTextActive: { color: COLORS.primary },
});
