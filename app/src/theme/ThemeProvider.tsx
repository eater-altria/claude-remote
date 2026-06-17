import React from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { palettes, type ColorScheme, type Palette } from './theme';

/** User preference: follow the OS, or pin a scheme. */
export type ThemeMode = 'system' | 'light' | 'dark';

const MODE_KEY = 'claude-remote.theme.v1';

interface ThemeContextValue {
  /** Active palette for the resolved scheme. */
  colors: Palette;
  /** The resolved scheme actually in effect. */
  scheme: ColorScheme;
  /** The user's stored preference (may be 'system'). */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setModeState] = React.useState<ThemeMode>('system');

  // Restore the saved preference once on mount.
  React.useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((raw) => {
        if (raw === 'light' || raw === 'dark' || raw === 'system') setModeState(raw);
      })
      .catch(() => {});
  }, []);

  const setMode = React.useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  }, []);

  const scheme: ColorScheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const colors = palettes[scheme];

  // Keep the native root background (visible behind/around RN, e.g. on rotate
  // or keyboard) in sync with the active scheme.
  React.useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ colors, scheme, mode, setMode }),
    [colors, scheme, mode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Active palette + scheme. Re-renders consumers when the scheme changes. */
export function useTheme(): { colors: Palette; scheme: ColorScheme } {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return { colors: ctx.colors, scheme: ctx.scheme };
}

/** Theme preference controls, for the settings switcher. */
export function useThemeMode(): { mode: ThemeMode; setMode: (m: ThemeMode) => void; scheme: ColorScheme } {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeProvider');
  return { mode: ctx.mode, setMode: ctx.setMode, scheme: ctx.scheme };
}
