/** Namespaced by room code, so one phone can hold two rooms at once. */
import type { Role } from "./protocol";

export interface StoredSession {
  role: Role;
  token: string;
  code: string;
  participantId?: string;
  name?: string;
}

const key = (role: Role, code: string) => `buzzer:${role}:${code}`;
const lastKey = (role: Role) => `buzzer:${role}:last`;

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(key(session.role, session.code), JSON.stringify(session));
    localStorage.setItem(lastKey(session.role), session.code);
  } catch {
    // Private mode or a full quota: it just will not survive a refresh.
  }
}

export function loadSession(role: Role, code?: string): StoredSession | null {
  try {
    const resolved = code ?? localStorage.getItem(lastKey(role));
    if (!resolved) return null;
    const raw = localStorage.getItem(key(role, resolved));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.token && parsed.role === role ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSession(role: Role, code: string): void {
  try {
    localStorage.removeItem(key(role, code));
    if (localStorage.getItem(lastKey(role)) === code) localStorage.removeItem(lastKey(role));
  } catch {
    // A stale token is rejected at the handshake anyway.
  }
}
