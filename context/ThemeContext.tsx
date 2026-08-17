import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Appearance,
  Platform,
  useColorScheme,
} from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { DARK_PALETTE, LIGHT_PALETTE } from '../theme/colors';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  isDark: boolean;
  mode: ThemeMode;
  resolvedScheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = '@planado/theme-mode';

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setStoredMode] = useState<ThemeMode>('system');

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !isThemeMode(stored)) return;
        setStoredMode(stored);
        Appearance.setColorScheme(stored === 'system' ? 'unspecified' : stored);
      })
      .catch((error) => console.warn('Could not restore Planado theme:', error));

    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setStoredMode(nextMode);
    Appearance.setColorScheme(nextMode === 'system' ? 'unspecified' : nextMode);
    void AsyncStorage.setItem(STORAGE_KEY, nextMode).catch((error) =>
      console.warn('Could not save Planado theme:', error),
    );
  }, []);

  const resolvedScheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

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
      setMode,
    }),
    [mode, resolvedScheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
