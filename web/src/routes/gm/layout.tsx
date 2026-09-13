/**
 * The game master's panel is five screens over one room, and this is what they
 * share: the session, the socket, and the chrome.
 *
 * `SocketProvider` mounts *here* rather than inside each screen on purpose.
 * React Router keeps a layout element mounted while only the child route
 * changes, so one connection — and the clock-offset samples it has accumulated,
 * which the buzzer's fair ranking depends on — outlives every navigation
 * between sections. Mounted a level lower, each of them would reconnect.
 */
import { Navigate, Outlet, useOutletContext, useParams } from "react-router";
import { GmShell } from "@/routes/gm/shell";
import { SocketProvider } from "@/lib/socket-provider";
import { useStoredSession } from "@/lib/use-session";
import type { StoredSession } from "@/lib/session";

export interface GmRoomContext {
  session: StoredSession;
  signOut: () => void;
}

export function useGmRoom(): GmRoomContext {
  return useOutletContext<GmRoomContext>();
}

export function useRoomCode(): string {
  return (useParams<{ code: string }>().code ?? "").toUpperCase();
}

export function GmRoomLayout() {
  const code = useRoomCode();
  const { session, forget } = useStoredSession("gm", code);

  // A render-time redirect, not an effect: the session is a synchronous read,
  // and signing out is the same branch rather than a second code path.
  if (!session) return <Navigate to="/gm" replace />;

  return (
    <SocketProvider token={session.token}>
      <GmShell session={session} onSignOut={forget} />
    </SocketProvider>
  );
}

/** An unknown section falls back to the overview, by absolute path: relative
 *  resolution from a splat is the one place a redirect loop would hide. */
export function GmSectionNotFound() {
  const code = useRoomCode();
  return <Navigate to={`/gm/${code}`} replace />;
}

export { Outlet };
