import { DynamicColorIOS, Platform, PlatformColor } from 'react-native';

import { SESSION_SCHEME } from './startupTheme';

// Every text/background pairing used by the UI meets WCAG AA (4.5:1). Keep the
// keys stable: Android resolves them from res/values*/colors.xml, so a key the
// installed APK does not define would crash an over-the-air update.
export const LIGHT_PALETTE = {
  background: '#F5F5FA',
  surface: '#FFFFFF',
  elevated: '#F8F8FC',
  elevatedStrong: '#F0F0F6',
  ink: '#1B1B24',
  muted: '#5E5E6B',
  faint: '#6B6B78',
  line: '#E6E6EF',
  primary: '#5B5CE2',
  primarySoft: '#F1F1FF',
  navy: '#23234D',
  lavender: '#8587F2',
  green: '#1A7A55',
  greenSoft: '#E7F7EF',
  orange: '#A85B17',
  orangeSoft: '#FFF1E5',
  red: '#B8404D',
  redSoft: '#FFEFF0',
  danger: '#B8404D',
  blue: '#2D6CBC',
  blueSoft: '#E8F1FF',
  input: '#F8F8FC',
} as const;

export const DARK_PALETTE: Record<keyof typeof LIGHT_PALETTE, string> = {
  background: '#0F1018',
  surface: '#191B26',
  elevated: '#212331',
  elevatedStrong: '#292B3A',
  ink: '#F2F2F8',
  muted: '#B4B5C4',
  faint: '#8C8E9E',
  line: '#2C2F3E',
  primary: '#8F91FF',
  primarySoft: '#272A4D',
  navy: '#20214A',
  lavender: '#A2A4FF',
  green: '#5BCB9D',
  greenSoft: '#163A2E',
  orange: '#F2A867',
  orangeSoft: '#3A2A1C',
  red: '#FF8791',
  redSoft: '#40222A',
  danger: '#FF8791',
  blue: '#7FB0F0',
  blueSoft: '#1B2F48',
  input: '#212331',
};

export type PlanadoPalette = typeof LIGHT_PALETTE;
export type PlanadoColorName = keyof PlanadoPalette;

function resourceName(name: PlanadoColorName) {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function adaptiveColor(name: PlanadoColorName): string {
  const light = LIGHT_PALETTE[name];
  const dark = DARK_PALETTE[name];

  if (Platform.OS === 'web') {
    return `var(--planado-${resourceName(name).replaceAll('_', '-')}, ${light})`;
  }

  if (Platform.OS === 'ios') {
    return DynamicColorIOS({ light, dark }) as unknown as string;
  }

  if (SESSION_SCHEME) return SESSION_SCHEME === 'dark' ? dark : light;

  return PlatformColor(`@color/planado_${resourceName(name)}`) as unknown as string;
}

export const COLORS = Object.fromEntries(
  (Object.keys(LIGHT_PALETTE) as PlanadoColorName[]).map((name) => [name, adaptiveColor(name)]),
) as Record<PlanadoColorName, string>;
