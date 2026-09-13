/**
 * The stored session, read at render. `loadSession` is a synchronous
 * localStorage read, so an effect only ever bought a wasted blank frame.
 *
 * Only the read is shared: what to do when there is no session differs by
 * screen — the game master's panel redirects to sign-in, `/play` to the join
 * form, and `/present` renders a card instead, because a stranger who opens the
 * beamer URL must not be sent to a password prompt.
 */
import { useCallback, useMemo, useState } from "react";
import type { Role } from "./protocol";
import { clearSession, loadSession, type StoredSession } from "./session";

export interface SessionHandle {
  session: StoredSession | null;
  /** Forgets the stored session and re-renders without it. */
  forget: () => void;
}

export function useStoredSession(role: Role, code?: string): SessionHandle {
  const [forgotten, setForgotten] = useState(false);
  // Keyed on the code so switching rooms in one tab reads the right one.
  const session = useMemo(
    () => (forgotten ? null : loadSession(role, code)),
    [role, code, forgotten],
  );

  const forget = useCallback(() => {
    const stored = code ?? loadSession(role)?.code;
    if (stored) clearSession(role, stored);
    setForgotten(true);
  }, [role, code]);

  return { session, forget };
}
