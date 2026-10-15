import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { authRequest, getSession, withSessionLock } from '../../lib/api';
import type { Session } from '../../lib/api';
import type { ApiError, MemberRole, User } from '../../types.ts';

interface AuthValue {
  user: User | null;
  loading: boolean;
  error: string;
  // The role a member chose to work in after signing in; leaders have none.
  workRole: MemberRole | null;
  chooseWorkRole(role: MemberRole | null): void;
  login(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
  retry(): void;
}
const Context = createContext<AuthValue | null>(null);
// Members are sent on to /role by AuthGate until they have chosen a role.
export const homeFor = (_user: User | null) => '/projects';
// Kept per tab, so a reload keeps the choice and signing out forgets it. Access is decided by
// the server from project membership, never by this value.
const WORK_ROLE = 'smartreview-work-role';
function storedWorkRole(): MemberRole | null {
  try {
    const value = sessionStorage.getItem(WORK_ROLE);
    return value === 'reviewer' || value === 'annotator' ? value : null;
  } catch {
    return null;
  }
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workRole, setWorkRole] = useState(storedWorkRole);
  // When the hour-long session ends; the user is signed out at that moment.
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const version = useRef(0);
  function start(session: Session) {
    setUser(session.user);
    setExpiresAt(session.expiresAt);
    setError('');
  }
  function chooseWorkRole(role: MemberRole | null) {
    setWorkRole(role);
    try {
      if (role) sessionStorage.setItem(WORK_ROLE, role);
      else sessionStorage.removeItem(WORK_ROLE);
    } catch {
      // Storage is unavailable: the choice lasts until the page is reloaded.
    }
  }
  async function restore() {
    const current = version.current;
    try {
      const result = await getSession();
      if (current === version.current) start(result);
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
      setExpiresAt(null);
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
  // Sign out when the session's hour is over, whether or not the page is being used.
  useEffect(() => {
    if (!expiresAt) return;
    // setTimeout overflows past about 24 days; a session is far shorter.
    const timer = setTimeout(
      () => window.dispatchEvent(new Event('smartreview:session-expired')),
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  async function login(username: string, password: string) {
    version.current++;
    const result = await withSessionLock(() => authRequest('login', { username, password }));
    chooseWorkRole(null);
    start(result);
    setLoading(false);
    return result.user;
  }
  async function logout() {
    await withSessionLock(() => authRequest('logout'));
    version.current++;
    chooseWorkRole(null);
    setUser(null);
    setExpiresAt(null);
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
      setExpiresAt(null);
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
        workRole,
        chooseWorkRole,
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
