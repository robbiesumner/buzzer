/**
 * The chrome every game-master screen sits in: who the room is, what the clock
 * is doing, and the way between sections.
 *
 * The timer is here rather than on a screen of its own because it is true of
 * the evening rather than of a section — the clock has to be one click away
 * whatever the game master happens to be looking at (SPEC.md section 7.5).
 */
import { useEffect } from "react";
import { toast } from "sonner";
import { Outlet, useLocation, useNavigate } from "react-router";
import { ConnectionBadge } from "@/components/connection-badge";
import { GmTimerBar } from "@/components/gm-timer";
import { LanguageSwitch } from "@/components/language-switch";
import { PresentLink } from "@/components/present-link";
import { RoomCard } from "@/components/room-card";
import { Heading, Screen, TextButton } from "@/components/kit";
import { useWideLayout } from "@/lib/media";
import { useSocket } from "@/lib/socket-provider";
import type { StoredSession } from "@/lib/session";
import { GmNav } from "@/routes/gm/nav";
import { t } from "@/i18n";

export function GmShell({
  session,
  onSignOut,
}: {
  session: StoredSession;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { room, error } = useSocket();
  const strings = t().gm;
  const errors = t().eventErrors;
  const wide = useWideLayout();
  const code = room?.code ?? session.code;

  // `<BrowserRouter>` has no scroll restoration, so a phone would arrive at a
  // new section halfway down the page it left.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // A refused event: the wrong player id, or nothing left to undo.
  useEffect(() => {
    if (error) toast.error(errors[error as keyof typeof errors] ?? errors.unknown);
    // `errors` is re-read on every render by design (see i18n/index.ts), so it
    // must not be a dependency or a language switch would re-raise the toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  function signOut() {
    onSignOut();
    navigate("/gm", { replace: true });
  }

  return (
    <Screen width="wide">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <Heading title={strings.panelTitle} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 [&>*]:whitespace-nowrap">
          <PresentLink code={code} />
          <TextButton onClick={signOut}>{strings.close}</TextButton>
          <LanguageSwitch />
        </div>
      </div>

      {/* Losing the connection is a persistent state, so it stays a banner;
          a refused event is a moment, so it is a toast. */}
      <ConnectionBadge />

      {/* What the room needs to join, and the clock the whole room is on. Both
          stay above every section rather than inside one, because both are true
          of the evening rather than of a section. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <RoomCard code={code} inline={wide} />
        <GmTimerBar />
      </div>

      <GmNav code={code} />

      <Outlet context={{ session, signOut }} />
    </Screen>
  );
}
