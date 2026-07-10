import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ONBOARDING_STEPS } from '../data/onboardingSteps.js';
import { useUserPreferences } from './UserPreferencesContext.jsx';
import { useAuth } from './AuthContext.jsx';

const OnboardingContext = createContext(null);

function seenKey(userId) {
  return `grainline_onboarding_seen_${userId}`;
}

export function OnboardingProvider({ children }) {
  const { user } = useAuth();
  const { preferences, loading, updatePreferences } = useUserPreferences();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [autoStartChecked, setAutoStartChecked] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-start exactly once per account. localStorage is checked first as an
  // instant, always-available fallback (so this never nags on every reload,
  // even before the user_preferences table exists) — the real DB flag from
  // user_preferences overrides it once that finishes loading, for real
  // cross-device sync.
  useEffect(() => {
    if (loading || autoStartChecked || !user) return;
    setAutoStartChecked(true);
    const seenLocally = localStorage.getItem(seenKey(user.id)) === '1';
    if (!preferences.onboarding_completed && !seenLocally) {
      setStepIndex(0);
      setActive(true);
    }
  }, [loading, preferences.onboarding_completed, autoStartChecked, user]);

  const step = active ? ONBOARDING_STEPS[stepIndex] : null;

  // Navigate to whatever route the current step needs to be on.
  useEffect(() => {
    if (step && step.path && location.pathname !== step.path) {
      navigate(step.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const finish = () => {
    setActive(false);
    if (user) localStorage.setItem(seenKey(user.id), '1');
    updatePreferences({ onboarding_completed: true });
  };

  const start = () => {
    setStepIndex(0);
    setActive(true);
  };

  const next = () => {
    if (stepIndex >= ONBOARDING_STEPS.length - 1) { finish(); return; }
    setStepIndex(i => i + 1);
  };

  const back = () => setStepIndex(i => Math.max(0, i - 1));

  const skipTour = () => finish();

  return (
    <OnboardingContext.Provider value={{
      active, step, stepIndex, total: ONBOARDING_STEPS.length,
      start, next, back, skipTour,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
