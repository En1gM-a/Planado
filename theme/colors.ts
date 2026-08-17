import { DynamicColorIOS, Platform, PlatformColor } from 'react-native';

export const LIGHT_PALETTE = {
  background: '#F6F6FB',
  surface: '#FFFFFF',
  elevated: '#FAFAFD',
  elevatedStrong: '#F4F4F8',
  ink: '#202027',
  muted: '#777782',
  faint: '#A1A1AC',
  line: '#E7E7EF',
  primary: '#5B5CE2',
  primarySoft: '#EEEEFF',
  navy: '#282852',
  lavender: '#8587F2',
  green: '#24966B',
  greenSoft: '#E9F8F1',
  orange: '#DE8139',
  orangeSoft: '#FFF2E7',
  red: '#C9525C',
  redSoft: '#FFF0F1',
  danger: '#C94E59',
  blue: '#4285D4',
  blueSoft: '#EAF3FF',
  input: '#FAFAFD',
} as const;

export const DARK_PALETTE: Record<keyof typeof LIGHT_PALETTE, string> = {
  background: '#101119',
  surface: '#1A1C27',
  elevated: '#222431',
  elevatedStrong: '#2A2C3A',
  ink: '#F3F3F8',
  muted: '#B7B8C5',
  faint: '#858795',
  line: '#303342',
  primary: '#8B8DFF',
  primarySoft: '#2A2B50',
  navy: '#252650',
  lavender: '#A2A4FF',
  green: '#57C99A',
  greenSoft: '#17372D',
  orange: '#F0A15D',
  orangeSoft: '#3B2A1D',
  red: '#FF7D88',
  redSoft: '#412228',
  danger: '#FF7D88',
  blue: '#75A9ED',
  blueSoft: '#1C3049',
  input: '#222431',
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

  return PlatformColor(`@color/planado_${resourceName(name)}`) as unknown as string;
}

export const COLORS = Object.fromEntries(
  (Object.keys(LIGHT_PALETTE) as PlanadoColorName[]).map((name) => [name, adaptiveColor(name)]),
) as Record<PlanadoColorName, string>;
