import { Navigate, useNavigate } from "react-router";
import { Buzzer } from "@/components/buzzer";
import { ConnectionBadge } from "@/components/connection-badge";
import { TimerHeader } from "@/components/countdown";
import { LanguageSwitch } from "@/components/language-switch";
import { PuzzleBoard } from "@/components/puzzle-board";
import { Standings } from "@/components/standings";
import { Button, Card, Heading, Eyebrow, RoomCode, Screen, SectionHeader } from "@/components/kit";
import { SocketProvider, useSocket } from "@/lib/socket-provider";
import { useStoredSession } from "@/lib/use-session";
import type { StoredSession } from "@/lib/session";
import { t } from "@/i18n";

export function PlayRoute() {
  const { session, forget } = useStoredSession("player");

  // A render-time redirect: the session is a synchronous localStorage read.
  if (!session) return <Navigate to="/" replace />;

  return (
    <SocketProvider token={session.token}>
      <Lobby session={session} onLeave={forget} />
    </SocketProvider>
  );
}

function Lobby({ session, onLeave }: { session: StoredSession; onLeave: () => void }) {
  const navigate = useNavigate();
  const { room, participants, round, puzzle } = useSocket();
  const strings = t().lobby;
  const scoreboard = t().scoreboard;

  const myScore = participants.find(
    (participant) => participant.id === session.participantId,
  )?.score;

  function leave() {
    onLeave();
    navigate("/", { replace: true });
  }

  return (
    <Screen width="panel">
      <Heading title={strings.title} subtitle={round || puzzle ? undefined : strings.waiting} />
      <ConnectionBadge />

      {/* Two columns on anything wider than a phone, and the split is by how
          often a thing is *touched*: the clock and the buzzer on the left, the
          things that are only read on the right. On a phone the same two
          groups fall back into the one column, in this order — the buzzer in
          the thumb zone, the standings below the fold where they can wait. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="flex flex-col gap-8">
          {/* The clock first: it is the thing with a deadline on it. */}
          <TimerHeader />

          {/* Above the buzzer while it is live, because it is the thing being
              touched; absent entirely the rest of the time. */}
          {puzzle ? (
            <Card>
              <PuzzleBoard />
            </Card>
          ) : null}

          {/* The buzzer sits above everything scrollable, in the thumb zone. */}
          <Card>
            <Buzzer participantId={session.participantId} />
          </Card>
        </div>

        <div className="flex flex-col gap-8">
          <Card className="text-center">
            <Eyebrow>{t().gm.codeLabel}</Eyebrow>
            <div className="mt-2">
              <RoomCode code={room?.code ?? session.code} size="display" />
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-body text-muted-foreground">{session.name}</p>
              {typeof myScore === "number" ? (
                <div className="mt-3 space-y-1">
                  <Eyebrow>{scoreboard.yourScore}</Eyebrow>
                  <p
                    data-testid="my-score"
                    className="numeric text-display leading-none font-semibold text-foreground tabular-nums"
                  >
                    {myScore}
                  </p>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <SectionHeader
              label={scoreboard.standings}
              aside={strings.count(participants.length)}
            />
            <Standings highlightId={session.participantId} />
          </Card>
        </div>
      </div>

      {/* Never the width of the screen: a full-bleed "Leave" on a laptop is a
          button the size of the buzzer, for the one action nobody means to
          press. */}
      <div className="mt-auto w-full space-y-4 self-center lg:max-w-xs">
        <Button variant="ghost" onClick={leave}>
          {strings.leave}
        </Button>
        <LanguageSwitch />
      </div>
    </Screen>
  );
}
