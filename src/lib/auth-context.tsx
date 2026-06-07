'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const AUTH_API = 'https://chaser-auth.isearover.workers.dev';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
  authenticatedFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('chaser_auth');
    if (stored) {
      try {
        const { token: t, user: u } = JSON.parse(stored);
        setToken(t);
        setUser(u);
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || '登入失敗' };
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('chaser_auth', JSON.stringify(data));
      return {};
    } catch (e) {
      return { error: '網絡錯誤' };
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${AUTH_API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || '註冊失敗' };
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('chaser_auth', JSON.stringify(data));
      return {};
    } catch (e) {
      return { error: '網絡錯誤' };
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('chaser_auth');
  }, []);

  const authenticatedFetch = useCallback((path: string, options: RequestInit = {}) => {
    return fetch(`${AUTH_API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, authenticatedFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
