/**
 * Design tokens for Claude Remote.
 *
 * Colors are theme-aware: `lightColors` / `darkColors` share the same `Palette`
 * shape and are selected at runtime by the ThemeProvider. Components must read
 * the active palette via `useTheme()` (never import a static `colors` object)
 * so they re-render when the user flips light/dark. `space` / `radius` / `font`
 * are theme-independent and can be imported directly.
 *
 * The look references the Claude app: warm cream canvas in light mode, warm
 * charcoal in dark mode, clay/terracotta accent, soft rounded cards.
 */

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  scheme: ColorScheme;

  // surfaces
  bg: string;
  bgElevated: string;
  card: string;
  cardAlt: string;
  border: string;
  borderStrong: string;

  // text
  text: string;
  textDim: string;
  textFaint: string;

  // accent (clay/terracotta)
  accent: string;
  accentDim: string;
  accentSoft: string;
  /** Foreground (text/icon) drawn on top of an accent fill. */
  onAccent: string;

  // roles
  user: string;
  userSoft: string;
  thinking: string;
  thinkingSoft: string;

  // status
  success: string;
  successSoft: string;
  warning: string;
  danger: string;
  dangerSoft: string;

  // diffs
  diffAddBg: string;
  diffAddText: string;
  diffDelBg: string;
  diffDelText: string;

  // code / monospace surfaces
  codeBg: string;
  codeText: string;

  /** Shadow color for elevated cards (visible mainly in light mode). */
  shadow: string;
  /** Suggested shadow opacity for the current scheme. */
  shadowOpacity: number;
}

export const darkColors: Palette = {
  scheme: 'dark',

  bg: '#211F1D',
  bgElevated: '#2A2825',
  card: '#2F2C29',
  cardAlt: '#38342F',
  border: '#403B35',
  borderStrong: '#524C44',

  text: '#F2EFE8',
  textDim: '#B5AFA3',
  textFaint: '#807A6F',

  accent: '#D97757',
  accentDim: '#A85638',
  accentSoft: 'rgba(217,119,87,0.18)',
  onAccent: '#FFFFFF',

  user: '#5B9BD5',
  userSoft: 'rgba(91,155,213,0.18)',
  thinking: '#A99BE0',
  thinkingSoft: 'rgba(169,155,224,0.16)',

  success: '#5FB87A',
  successSoft: 'rgba(95,184,122,0.16)',
  warning: '#E0A93B',
  danger: '#F0796B',
  dangerSoft: 'rgba(240,121,107,0.16)',

  diffAddBg: 'rgba(95,184,122,0.16)',
  diffAddText: '#7EE787',
  diffDelBg: 'rgba(240,121,107,0.16)',
  diffDelText: '#FF9492',

  codeBg: '#191715',
  codeText: '#D7D2C8',

  shadow: '#000000',
  shadowOpacity: 0.32,
};

export const lightColors: Palette = {
  scheme: 'light',

  bg: '#F4F2ED',
  bgElevated: '#FAF9F5',
  card: '#FFFFFF',
  cardAlt: '#F1EFE8',
  border: '#E7E3DA',
  borderStrong: '#D7D2C6',

  text: '#23211E',
  textDim: '#6B665E',
  textFaint: '#9A948B',

  accent: '#C96442',
  accentDim: '#A04E32',
  accentSoft: 'rgba(201,100,66,0.12)',
  onAccent: '#FFFFFF',

  user: '#2B6CB0',
  userSoft: 'rgba(43,108,176,0.12)',
  thinking: '#6F5FBE',
  thinkingSoft: 'rgba(111,95,190,0.12)',

  success: '#2E9E54',
  successSoft: 'rgba(46,158,84,0.14)',
  warning: '#B5830E',
  danger: '#D43F33',
  dangerSoft: 'rgba(212,63,51,0.12)',

  diffAddBg: 'rgba(46,158,84,0.15)',
  diffAddText: '#1A7F37',
  diffDelBg: 'rgba(212,63,51,0.13)',
  diffDelText: '#C0392B',

  codeBg: '#F1EFE8',
  codeText: '#33302B',

  shadow: '#3A352D',
  shadowOpacity: 0.08,
};

export const palettes: Record<ColorScheme, Palette> = {
  light: lightColors,
  dark: darkColors,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const font = {
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26 },
  mono: 'Menlo' as const, // RN falls back gracefully on Android (monospace)
};

export function categoryColor(category: string, c: Palette): string {
  switch (category) {
    case 'execute':
      return c.warning;
    case 'edit':
      return c.accent;
    case 'read':
    case 'search':
      return c.textDim;
    case 'web':
      return c.user;
    case 'task':
      return c.thinking;
    case 'ask':
      return c.thinking;
    default:
      return c.textDim;
  }
}

export function categoryIcon(category: string): string {
  switch (category) {
    case 'execute':
      return 'terminal';
    case 'edit':
      return 'create';
    case 'read':
      return 'document-text';
    case 'search':
      return 'search';
    case 'web':
      return 'globe';
    case 'task':
      return 'git-branch';
    case 'ask':
      return 'help-circle';
    default:
      return 'cube';
  }
}
