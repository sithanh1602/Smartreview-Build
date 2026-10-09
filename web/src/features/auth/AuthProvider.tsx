import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { authRequest, refreshSession, withSessionLock } from '../../lib/api';
import type { ApiError, User } from '../../types.ts';

interface AuthValue {
  user: User | null;
  loading: boolean;
  error: string;
  login(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
  retry(): void;
}
const Context = createContext<AuthValue | null>(null);
export const homeFor = (user: User | null) =>
  user?.role === 'annotator' ? '/annotation' : '/projects';
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  async function restore() {
    const current = version.current;
    try {
      const result = await refreshSession();
      if (current === version.current) {
        setUser(result.user);
        setError('');
      }
    } catch (e) {
      if (current === version.current) {
        if ((e as ApiError).status === 401) setUser(null);
        else setError((e as ApiError).message);
      }
    } finally {
      if (current === version.current) setLoading(false);
    }
  }
  useEffect(() => {
    const expire = () => {
      version.current++;
      setUser(null);
      setError('');
      setLoading(false);
    };
    window.addEventListener('smartreview:session-expired', expire);
    restore();
    const timer = setInterval(restore, 5 * 60 * 1000);
    const visible = () => {
      if (document.visibilityState === 'visible') restore();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('smartreview:session-expired', expire);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  async function login(username: string, password: string) {
    version.current++;
    const result = await withSessionLock(() => authRequest('login', { username, password }));
    setUser(result.user);
    setError('');
    setLoading(false);
    return result.user;
  }
  async function logout() {
    await withSessionLock(() => authRequest('logout'));
    version.current++;
    setUser(null);
    setError('');
    const channel = globalThis.BroadcastChannel ? new BroadcastChannel('smartreview-auth') : null;
    channel?.postMessage('logout');
    channel?.close();
  }
  useEffect(() => {
    if (!globalThis.BroadcastChannel) return;
    const channel = new BroadcastChannel('smartreview-auth');
    channel.onmessage = () => {
      version.current++;
      setUser(null);
      setError('');
      setLoading(false);
    };
    return () => channel.close();
  }, []);
  return (
    <Context.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        retry: () => {
          setLoading(true);
          setError('');
          restore();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
