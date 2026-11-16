'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import type { Language, ThemeMode } from '@/lib/types';
import DashboardShell from './DashboardShell';

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

export default function AppRoot() {
  const [lang, setLang] = useState<Language>('id');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const timezone = useClientTimezone();

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
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
    });
    return () => {
      active = false;
    };
  }, []);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
    >
      <DashboardShell
        lang={lang}
        theme={theme}
        timezone={timezone}
        onToggleLang={toggleLang}
        onToggleTheme={toggleTheme}
      />
    </motion.div>
  );
}
