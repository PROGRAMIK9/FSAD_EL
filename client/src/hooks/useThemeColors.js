import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

const read = (name) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim().replaceAll(' ', ',')})`;

/** Resolved token colours for libraries (Recharts) that need literal colour strings. */
export function useThemeColors() {
  const { theme } = useTheme();
  return useMemo(
    () => ({
      primary: read('primary'),
      success: read('success'),
      warn: read('warn'),
      danger: read('danger'),
      info: read('info'),
      border: read('border'),
      muted: read('muted'),
      subtle: read('subtle'),
      surface: read('surface'),
      fg: read('fg'),
    }),
    [theme],
  );
}
