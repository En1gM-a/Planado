import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { type ReactNode, useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { COLORS } from '../theme/colors';
import { MOTION, RADIUS, TYPE } from '../theme/tokens';

/** Hides the bar while the Android keyboard is open, like `tabBarHideOnKeyboard`. */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

export function PlanadoTabBar({ descriptors, insets, navigation, state }: BottomTabBarProps) {
  const keyboardVisible = useKeyboardVisible();
  if (keyboardVisible) return null;

  return (
    <View style={styles.bar}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : options.title ?? route.name;

        return (
          <TabItem
            bottomInset={Math.max(insets.bottom, 10)}
            focused={focused}
            key={route.key}
            label={label}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            renderIcon={(color) => options.tabBarIcon?.({ focused, color, size: 23 }) ?? null}
          />
        );
      })}
    </View>
  );
}

function TabItem({
  bottomInset,
  focused,
  label,
  onLongPress,
  onPress,
  renderIcon,
}: {
  /** Padding inside the item, so taps near the bottom edge still land. */
  bottomInset: number;
  focused: boolean;
  label: string;
  onLongPress: () => void;
  onPress: () => void;
  renderIcon: (color: string) => ReactNode;
}) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.set(withSpring(focused ? 1 : 0, MOTION.spring));
  }, [focused, progress]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: Math.min(progress.get(), 1),
    transform: [{ scaleX: 0.55 + progress.get() * 0.45 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.get() * 0.06 }],
  }));

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onLongPress={onLongPress}
      onPress={onPress}
      style={[styles.item, { paddingBottom: bottomInset }]}
    >
      <View style={styles.itemContent}>
        <View style={styles.iconSlot}>
          <Animated.View style={[styles.indicator, indicatorStyle]} />
          <Animated.View style={iconStyle}>
            {renderIcon(focused ? COLORS.primary : COLORS.muted)}
          </Animated.View>
        </View>
        <Text numberOfLines={1} style={[styles.label, focused && styles.labelActive]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 8,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  item: { flex: 1, paddingTop: 8 },
  itemContent: { minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 },
  iconSlot: { width: 64, height: 32, alignItems: 'center', justifyContent: 'center' },
  indicator: {
    position: 'absolute',
    width: 64,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primarySoft,
  },
  label: { ...TYPE.footnote, color: COLORS.muted, fontWeight: '600' },
  labelActive: { color: COLORS.primary, fontWeight: '700' },
});
