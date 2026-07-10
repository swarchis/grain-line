import { useEffect, useRef, useState } from 'react';
import { useUserPreferences } from '../context/UserPreferencesContext.jsx';

// Local storage is the instant, pre-network source (avoids a flash of the
// wrong theme before the user_preferences round-trip resolves). Once real
// preferences load, they win — that's what makes theme follow you cross-device.
export function useTheme() {
  const { preferences, loading, updatePreferences } = useUserPreferences();
  const [theme, setThemeState] = useState(() => localStorage.getItem('grainline_theme') || 'light');
  const reconciled = useRef(false);

  useEffect(() => {
    if (!loading && !reconciled.current) {
      reconciled.current = true;
      if (preferences.theme && preferences.theme !== theme) setThemeState(preferences.theme);
    }
  }, [loading, preferences.theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('grainline_theme', theme);
  }, [theme]);

  const setTheme = (next) => {
    setThemeState(next);
    updatePreferences({ theme: next });
  };
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return { theme, isDark: theme === 'dark', toggle, setTheme };
}
