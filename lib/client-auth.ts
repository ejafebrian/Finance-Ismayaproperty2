'use client';

const TOKEN_STORAGE_KEY = 'ismaya_session_token';
let memoryToken: string | null = null;

export function setClientSessionToken(token: string | null) {
  memoryToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }
}

export function getClientSessionToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        memoryToken = stored;
        return stored;
      }
    } catch {
      // ignore storage errors
    }
  }
  return null;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getClientSessionToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    credentials: 'include',
    headers,
  });
}
