'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Eye, EyeOff, Globe, Moon, Sun, Clock } from 'lucide-react';
import { getCopy } from '@/lib/i18n';
import { setClientSessionToken } from '@/lib/client-auth';
import type { Language, PublicUser, ThemeMode } from '@/lib/types';

interface LoginViewProps {
  lang: Language;
  theme: ThemeMode;
  timezone: string;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onLoginSuccess: (user: PublicUser) => void;
}

const LOGO_SRC = '/assets/aistudio/436288cc-2e74-4fc9-b640-0cf371e4aa32_53fea3f7.png';

export default function LoginView({
  lang,
  theme,
  timezone,
  onToggleLang,
  onToggleTheme,
  onLoginSuccess,
}: LoginViewProps) {
  const copy = getCopy(lang);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nowStr, setNowStr] = useState('');

  useEffect(() => {
    const updateClock = () => {
      try {
        const formatted = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: timezone,
        }).format(new Date());
        setNowStr(formatted);
      } catch {
        setNowStr(new Date().toLocaleTimeString());
      }
    };
    updateClock();
    const timer = setInterval(updateClock, 15000);
    return () => clearInterval(timer);
  }, [lang, timezone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError(copy.login.errorEmpty);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 401 ? copy.login.errorInvalid : data.error || copy.login.errorGeneric);
        return;
      }

      if (data.token) {
        setClientSessionToken(data.token);
      }
      if (data.user) {
        onLoginSuccess(data.user);
      } else {
        setError(copy.login.errorGeneric);
      }
    } catch {
      setError(copy.login.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Minimal Top Utility Controls */}
      <header className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          <Clock className="w-3.5 h-3.5 text-[#8B7335] dark:text-[#C5AE6B]" />
          <span>{nowStr || '...'}</span>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <span className="hidden sm:inline">{timezone}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            aria-label="Switch language"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'ID' : 'EN'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            aria-label={theme === 'dark' ? copy.header.lightMode : copy.header.darkMode}
            title={theme === 'dark' ? copy.header.lightMode : copy.header.darkMode}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-[#C5AE6B]" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Clean Centered Professional Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 sm:p-9"
        >
          {/* Company Logo + Simplified Title */}
          <div className="text-center pb-6 mb-6 border-b border-slate-200 dark:border-slate-800">
            <div className="relative w-16 h-12 mx-auto mb-4">
              <Image
                src={LOGO_SRC}
                alt="ISMAYA PROPERTY"
                fill
                sizes="64px"
                className="object-contain"
                referrerPolicy="no-referrer"
                priority
              />
            </div>

            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {copy.login.heading}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {copy.login.subheading}
            </p>
          </div>

          {/* Credentials Form - Zero Credentials Displayed */}
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label
                htmlFor="ismaya-username"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5"
              >
                {copy.login.usernameLabel}
              </label>
              <input
                id="ismaya-username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={copy.login.usernamePlaceholder}
                autoComplete="username"
                required
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B] focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <label
                htmlFor="ismaya-password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5"
              >
                {copy.login.passwordLabel}
              </label>
              <div className="relative">
                <input
                  id="ismaya-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={copy.login.passwordPlaceholder}
                  autoComplete="current-password"
                  required
                  className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#8B7335] dark:focus:ring-[#C5AE6B] focus:border-transparent transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? copy.login.hidePassword : copy.login.showPassword}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="px-3.5 py-2.5 text-sm rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] mt-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-[#C5AE6B] text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-[#d3be80] disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {submitting ? copy.login.submittingButton : copy.login.submitButton}
            </button>
          </form>
        </motion.div>
      </main>

      {/* Clear Company Copyright Footer */}
      <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {copy.footer.copyright}
          </span>
          <span>{copy.footer.systemLabel}</span>
        </div>
      </footer>
    </div>
  );
}
