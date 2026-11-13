'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  authFetch,
  getClientSessionToken,
  setClientSessionToken,
} from '@/lib/client-auth';
import type { Language, PublicUser, ThemeMode } from '@/lib/types';
import LoginView from './LoginView';
import DashboardShell from './DashboardShell';

interface AppRootProps {
  initialUser: PublicUser | null;
}

const emptySubscribe = () => () => {};

function useClientTimezone(): string {
  return useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
      } catch {
        return 'Asia/Jakarta';
      }
    },
    () => 'Asia/Jakarta'
  );
}

export default function AppRoot({ initialUser }: AppRootProps) {
  const [user, setUser] = useState<PublicUser | null>(initialUser);
  const [lang, setLang] = useState<Language>('id');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const timezone = useClientTimezone();

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      const savedLang = window.localStorage.getItem('ismaya_lang');
      if (savedLang === 'en' || savedLang === 'id') {
        setLang(savedLang);
        document.documentElement.lang = savedLang;
      }

      const savedTheme = window.localStorage.getItem('ismaya_theme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      } else if (
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        setTheme('dark');
        document.documentElement.classList.add('dark');
      }

      if (!initialUser && getClientSessionToken()) {
        try {
          const res = await authFetch('/api/auth/me', { cache: 'no-store' });
          const data = await res.json();
          if (active && data.user) {
            setUser(data.user);
          } else if (active) {
            setClientSessionToken(null);
          }
        } catch {
          // ignore
        }
      }
    });
    return () => {
      active = false;
    };
  }, [initialUser]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      window.localStorage.setItem('ismaya_theme', next);
      return next;
    });
  };

  const toggleLang = () => {
    setLang((prev) => {
      const next: Language = prev === 'id' ? 'en' : 'id';
      window.localStorage.setItem('ismaya_lang', next);
      document.documentElement.lang = next;
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setClientSessionToken(null);
      setUser(null);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {user ? (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <DashboardShell
            user={user}
            lang={lang}
            theme={theme}
            timezone={timezone}
            onToggleLang={toggleLang}
            onToggleTheme={toggleTheme}
            onUserUpdated={setUser}
            onLogout={handleLogout}
          />
        </motion.div>
      ) : (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <LoginView
            lang={lang}
            theme={theme}
            timezone={timezone}
            onToggleLang={toggleLang}
            onToggleTheme={toggleTheme}
            onLoginSuccess={setUser}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
