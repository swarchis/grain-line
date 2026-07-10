import React, { createContext, useContext, useRef, useState } from 'react';

// Small shared UI state that needs to be reachable from both the Sidebar
// (which owns the actual search input and renders the shortcuts button) and
// anywhere else in the app that wants to trigger them (Ctrl+K, Home's search
// icon, the '?' key).
const AppUIContext = createContext(null);

export function AppUIProvider({ children }) {
  const searchFocusRef = useRef(null);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <AppUIContext.Provider value={{
      registerSearchFocus: (fn) => { searchFocusRef.current = fn; },
      focusSearch: () => searchFocusRef.current?.(),
      helpOpen,
      openHelp: () => setHelpOpen(true),
      closeHelp: () => setHelpOpen(false),
    }}>
      {children}
    </AppUIContext.Provider>
  );
}

export function useAppUI() {
  const ctx = useContext(AppUIContext);
  if (!ctx) throw new Error('useAppUI must be used inside AppUIProvider');
  return ctx;
}
