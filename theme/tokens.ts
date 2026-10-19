import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { Easing } from 'react-native-reanimated';

import { COLORS } from './colors';

/**
 * Text and icons placed on a filled primary (or status-colored) surface.
 * White in light mode; deep ink in dark mode, where the primary is a light
 * tint. Reuses an existing palette key so Android never needs a new resource.
 */
export const ON_PRIMARY = COLORS.surface;

/** Type scale. Nothing renders below 12px so text stays readable. */
export const TYPE = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.9 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.7 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  title3: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: '700', letterSpacing: -0.15 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  subhead: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  footnote: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

export const SPACE = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;

export const RADIUS = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 28, pill: 999 } as const;

/** Minimum touch target for anything tappable. */
export const HIT = 44;

/** Page gutter shared by every screen. */
export const PAGE = { maxWidth: 720, gutter: 20 } as const;

/**
 * Soft, layered shadows. Static shadows cost nothing per frame, but each one is
 * a blurred layer, so keep them for hero cards and primary actions, not rows.
 */
export const SHADOW = {
  sm: '0px 1px 2px rgba(17, 17, 40, 0.05), 0px 2px 10px rgba(17, 17, 40, 0.04)',
  md: '0px 2px 6px rgba(17, 17, 40, 0.05), 0px 12px 28px rgba(17, 17, 40, 0.08)',
  lg: '0px 10px 24px rgba(10, 10, 30, 0.16), 0px 28px 56px rgba(10, 10, 30, 0.20)',
  primary: '0px 8px 22px rgba(91, 92, 226, 0.30)',
} as const;

export const GRADIENT = {
  /** Deep indigo used for hero cards in both themes. */
  hero: 'radial-gradient(circle at 92% 0%, rgba(160, 162, 255, 0.55) 0%, rgba(160, 162, 255, 0) 52%), linear-gradient(140deg, #1D1E4A 0%, #2E2F86 55%, #5052D6 100%)',
  heroFallback: '#282852',
  primary: 'linear-gradient(135deg, #6D6EF0 0%, #5152D8 100%)',
} as const;

/** Cross-platform gradient fill with a solid fallback for older renderers. */
export function gradientStyle(image: string, fallbackColor: string): ViewStyle {
  if (Platform.OS === 'web') {
    return { backgroundColor: fallbackColor, backgroundImage: image } as ViewStyle;
  }
  return { backgroundColor: fallbackColor, experimental_backgroundImage: image };
}

/** A group/member color with an alpha suffix, e.g. tint('#5B5CE2', 0.12). */
export function tint(hex: string, alpha: number) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#5B5CE2';
  const channel = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${normalized}${channel}`;
}

/** Motion tokens: short, eased, and interruptible. */
export const MOTION = {
  fast: 140,
  base: 220,
  slow: 340,
  stagger: 45,
  maxStaggerDelay: 360,
  easeOut: Easing.bezier(0.22, 1, 0.36, 1),
  spring: { damping: 18, stiffness: 240, mass: 0.8 },
  pressScale: 0.97,
} as const;
