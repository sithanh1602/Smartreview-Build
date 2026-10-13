import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import './styles.css';
import { AuthProvider } from './features/auth/AuthProvider';
import { applyTheme } from './lib/theme';
import { lang, onLang } from './lib/lang';
// Imported for its effect: it gives the JSX runtime the translator before anything renders.
import './lib/i18n';

applyTheme();

// A new key re-renders every page in the chosen language; the session above it is kept.
function Pages() {
  const current = useSyncExternalStore(onLang, () => lang);
  return <RouterProvider key={current} router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Pages />
    </AuthProvider>
  </React.StrictMode>,
);
