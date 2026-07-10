import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from './AuthContext.jsx';

const UserPreferencesContext = createContext(null);

const DEFAULTS = { full_name: null, theme: 'light', onboarding_completed: false, show_shortcut_hints: true };

export function UserPreferencesProvider({ children }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setPreferences(DEFAULTS); setLoading(false); return; }

    async function loadOrCreate() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;

        if (data) {
          setPreferences(data);
        } else {
          // Lazily create the row on first ever load for this user, seeded from
          // whatever theme they'd already picked locally (pre-account-sync default).
          const seedTheme = localStorage.getItem('grainline_theme') || 'light';
          const { data: created, error: createError } = await supabase
            .from('user_preferences')
            .insert([{ user_id: user.id, theme: seedTheme }])
            .select()
            .single();
          if (createError) throw createError;
          setPreferences(created);
        }
      } catch (err) {
        console.error('Error loading user preferences:', err);
      } finally {
        setLoading(false);
      }
    }

    loadOrCreate();
  }, [user]);

  const updatePreferences = async (updates) => {
    if (!user) return;
    // Optimistic — preferences are low-stakes UI state, no need to block on the round-trip.
    setPreferences(prev => ({ ...prev, ...updates }));
    const { error } = await supabase
      .from('user_preferences')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) console.error('Failed to save preference', error);
  };

  return (
    <UserPreferencesContext.Provider value={{ preferences, loading, updatePreferences }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) throw new Error('useUserPreferences must be used inside UserPreferencesProvider');
  return ctx;
}
