import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import {
  Appearance,
  DevSettings,
  Platform,
  useColorScheme,
} from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DARK_PALETTE, LIGHT_PALETTE } from '../theme/colors';
import { SAVED_THEME_MODE, SESSION_SCHEME } from '../theme/startupTheme';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  isDark: boolean;
  mode: ThemeMode;
  resolvedScheme: 'light' | 'dark';
  /**
   * Bumps when the theme changes while screens are showing, on Android. Native
   * views there keep the palette colors they resolved when they were drawn, so
   * screens keyed on this remount in the new theme.
   */
  revision: number;
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = '@planado/theme-mode';
/** Longest wait for the saved theme before showing the app in the system theme. */
const RESTORE_TIMEOUT_MS = 1500;

// On Android the saved theme has to be in place before the first screen is
// drawn, so the splash screen stays up until it has been restored.
if (Platform.OS === 'android') void SplashScreen.preventAutoHideAsync();

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setStoredMode] = useState<ThemeMode>(SAVED_THEME_MODE ?? 'system');
  const [restored, setRestored] = useState(Platform.OS !== 'android' || SAVED_THEME_MODE !== null);
  const [revision, setRevision] = useState(0);
  const drawnScheme = useRef<'light' | 'dark' | null>(null);

  useEffect(() => {
    let active = true;
    const fallback = setTimeout(() => setRestored(true), RESTORE_TIMEOUT_MS);

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !isThemeMode(stored)) return;
        setStoredMode(stored);
        Appearance.setColorScheme(stored === 'system' ? 'unspecified' : stored);
      })
      .catch((error) => console.warn('Could not restore Planado theme:', error))
      .finally(() => {
        clearTimeout(fallback);
        if (active) setRestored(true);
      });

    return () => {
      active = false;
      clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (restored && Platform.OS === 'android') SplashScreen.hide();
  }, [restored]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    if (nextMode === mode) return;
    setStoredMode(nextMode);
    Appearance.setColorScheme(nextMode === 'system' ? 'unspecified' : nextMode);
    const saved = AsyncStorage.setItem(STORAGE_KEY, nextMode);
    saved.catch((error) => console.warn('Could not save Planado theme:', error));

    // This session's palette is fixed (see theme/startupTheme), so restart the
    // JavaScript once the choice is saved; it starts again in the new palette.
    if (SESSION_SCHEME !== null && nextMode !== SESSION_SCHEME) {
      void saved.then(() => Updates.reloadAsync()).catch(() => DevSettings.reload());
    }
  }, [mode]);

  const resolvedScheme: 'light' | 'dark' = SESSION_SCHEME
    ?? (mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode);

  // The theme changed under screens already on display (an in-app switch, or
  // the phone's theme while following the system). Remount them once the
  // native side reports the new scheme, which is also when it drops the
  // palette colors it cached for the old one.
  const nativeScheme: 'light' | 'dark' = systemScheme === 'dark' ? 'dark' : 'light';
  useEffect(() => {
    if (!restored || Platform.OS !== 'android' || SESSION_SCHEME !== null) return;
    if (drawnScheme.current === null) {
      drawnScheme.current = nativeScheme;
      return;
    }
    if (drawnScheme.current === nativeScheme) return;
    drawnScheme.current = nativeScheme;
    const frame = requestAnimationFrame(() => setRevision((value) => value + 1));
    return () => cancelAnimationFrame(frame);
  }, [nativeScheme, restored]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const palette = resolvedScheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
    const root = document.documentElement;
    root.style.colorScheme = resolvedScheme;
    Object.entries(palette).forEach(([name, value]) => {
      const cssName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      root.style.setProperty(`--planado-${cssName}`, value);
    });
    root.style.backgroundColor = palette.background;
  }, [resolvedScheme]);

  const value = useMemo(
    () => ({
      isDark: resolvedScheme === 'dark',
      mode,
      resolvedScheme,
      revision,
      setMode,
    }),
    [mode, resolvedScheme, revision, setMode],
  );

  return <ThemeContext.Provider value={value}>{restored ? children : null}</ThemeContext.Provider>;
}
