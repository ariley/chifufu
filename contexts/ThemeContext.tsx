import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chifufu:theme';

// ── Theme definition ───────────────────────────────────────────
export type ThemeKey = 'default' | 'ocean' | 'sunset' | 'mono';

interface AppThemeDef {
  key: ThemeKey;
  label: string;
  accent: string;
  accentLight: string;
  // light mode
  bg: string;
  bgSec: string;
  text: string;
  textSec: string;
  textTer: string;
  border: string;
  // dark mode
  d_bg: string;
  d_bgSec: string;
  d_text: string;
  d_textSec: string;
  d_textTer: string;
  d_border: string;
}

export interface ResolvedTheme {
  key: ThemeKey;
  label: string;
  accent: string;
  accentLight: string;
  bg: string;
  bgSec: string;
  text: string;
  textSec: string;
  textTer: string;
  border: string;
}

const THEMES: AppThemeDef[] = [
  {
    key: 'default',
    label: 'Default',
    accent: '#1D9E75',
    accentLight: '#E1F5EE',
    bg: '#FFFFFF',
    bgSec: '#F2F2F7',
    text: '#000000',
    textSec: '#6C6C70',
    textTer: '#AEAEB2',
    border: '#E5E5EA',
    d_bg: '#000000',
    d_bgSec: '#1C1C1E',
    d_text: '#FFFFFF',
    d_textSec: '#ABABAB',
    d_textTer: '#636366',
    d_border: '#38383A',
  },
  {
    key: 'ocean',
    label: 'Ocean',
    accent: '#0A84FF',
    accentLight: '#E0F0FF',
    bg: '#FFFFFF',
    bgSec: '#F0F4F8',
    text: '#000000',
    textSec: '#5A6A7A',
    textTer: '#9AAABB',
    border: '#D8E4ED',
    d_bg: '#000000',
    d_bgSec: '#0D1A26',
    d_text: '#FFFFFF',
    d_textSec: '#8AA5BE',
    d_textTer: '#4A6A85',
    d_border: '#1E3A50',
  },
  {
    key: 'sunset',
    label: 'Sunset',
    accent: '#FF6B35',
    accentLight: '#FFF0EA',
    bg: '#FFFFFF',
    bgSec: '#FBF4F0',
    text: '#1A0A00',
    textSec: '#7A5A4A',
    textTer: '#BBA090',
    border: '#EDD8CC',
    d_bg: '#0F0800',
    d_bgSec: '#1E1008',
    d_text: '#FFF8F5',
    d_textSec: '#C4907A',
    d_textTer: '#7A4A38',
    d_border: '#3A1E12',
  },
  {
    key: 'mono',
    label: 'Mono',
    accent: '#000000',
    accentLight: '#F2F2F2',
    bg: '#FFFFFF',
    bgSec: '#F5F5F5',
    text: '#000000',
    textSec: '#555555',
    textTer: '#999999',
    border: '#DDDDDD',
    d_bg: '#000000',
    d_bgSec: '#111111',
    d_text: '#FFFFFF',
    d_textSec: '#AAAAAA',
    d_textTer: '#555555',
    d_border: '#333333',
  },
];

export const THEME_DEFS = THEMES;

function resolveTheme(def: AppThemeDef, dark: boolean): ResolvedTheme {
  return {
    key: def.key,
    label: def.label,
    accent: def.accent,
    accentLight: def.accentLight,
    bg: dark ? def.d_bg : def.bg,
    bgSec: dark ? def.d_bgSec : def.bgSec,
    text: dark ? def.d_text : def.text,
    textSec: dark ? def.d_textSec : def.textSec,
    textTer: dark ? def.d_textTer : def.textTer,
    border: dark ? def.d_border : def.border,
  };
}

// ── Context ────────────────────────────────────────────────────
interface ThemeContextValue {
  theme: ResolvedTheme;
  themeKey: ThemeKey;
  setTheme: (key: ThemeKey) => void;
}

const defaultDef = THEMES[0];
const ThemeContext = createContext<ThemeContextValue>({
  theme: resolveTheme(defaultDef, false),
  themeKey: 'default',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const [themeKey, setThemeKey] = useState<ThemeKey>('default');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val && THEMES.find((t) => t.key === val)) {
        setThemeKey(val as ThemeKey);
      }
    });
  }, []);

  function setTheme(key: ThemeKey) {
    setThemeKey(key);
    AsyncStorage.setItem(STORAGE_KEY, key);
  }

  const def = THEMES.find((t) => t.key === themeKey) ?? defaultDef;
  const theme = resolveTheme(def, dark);

  return (
    <ThemeContext.Provider value={{ theme, themeKey, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ResolvedTheme & { themeKey: ThemeKey; setTheme: (key: ThemeKey) => void } {
  const { theme, themeKey, setTheme } = useContext(ThemeContext);
  return { ...theme, themeKey, setTheme };
}
