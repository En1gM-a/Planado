import { Appearance, NativeModules, Platform } from 'react-native';

type SavedThemeMode = 'system' | 'light' | 'dark';
type PlanadoThemeModule = { getSavedThemeMode?: () => string };

/**
 * The theme saved on this device, read synchronously before any style exists.
 * Only Android builds that ship the PlanadoTheme module provide it; elsewhere
 * (iOS, web, older Android builds) this is null and colors adapt natively.
 */
function readSavedThemeMode(): SavedThemeMode | null {
  if (Platform.OS !== 'android') return null;
  const module = NativeModules.PlanadoTheme as PlanadoThemeModule | undefined;
  if (typeof module?.getSavedThemeMode !== 'function') return null;
  try {
    const saved = module.getSavedThemeMode();
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export const SAVED_THEME_MODE = readSavedThemeMode();

/**
 * The palette this session draws with on Android, or null where colors adapt
 * natively. Android's native theme colors resolve view backgrounds and text
 * through different contexts once the app overrides the system theme, so new
 * builds pick plain colors once at startup and reload to change theme.
 */
export const SESSION_SCHEME: 'light' | 'dark' | null = SAVED_THEME_MODE === null
  ? null
  : SAVED_THEME_MODE === 'system'
    ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light')
    : SAVED_THEME_MODE;
