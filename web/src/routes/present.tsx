/**
 * Runs on the game master's own session: there is no third role. It must obey
 * the hidden-scores flag itself, because a GM socket is sent the numbers even
 * while they are hidden, and this is the screen the whole room is looking at.
 */
import { Link, useParams } from "react-router";
import { ConnectionBadge } from "@/components/connection-badge";
import { TimerHeader } from "@/components/countdown";
import { LanguageSwitch } from "@/components/language-switch";
import { QrCode } from "@/components/qr-code";
import { Standings } from "@/components/standings";
import { Button, Card, Eyebrow, Note, RoomCode, Screen, SectionHeader } from "@/components/kit";
import { useJoinLink } from "@/lib/join-url";
import { useStoredSession } from "@/lib/use-session";
import { SocketProvider, useSocket } from "@/lib/socket-provider";
import { t } from "@/i18n";

export function PresentRoute() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const { session } = useStoredSession("gm", code);

  if (!session) return <NeedsGameMaster />;

  return (
    <SocketProvider token={session.token}>
      <PresentScreen code={code} />
    </SocketProvider>
  );
}

function NeedsGameMaster() {
  const strings = t().present;
  return (
    <Screen centred>
      <Card className="text-center">
        <p className="text-lead text-muted-foreground">{strings.needsGm}</p>
        <Link to="/gm" className="mt-6 block">
          <Button>{strings.signIn}</Button>
        </Link>
      </Card>
    </Screen>
  );
}

function PresentScreen({ code }: { code: string }) {
  const { room, participants, timer } = useSocket();
  const strings = t().present;
  const gm = t().gm;
  const qr = t().qr;
  const lobby = t().lobby;
  const shown = room?.code ?? code;
  const { origin, link } = useJoinLink(shown);

  const onTheClock = timer !== null && timer.state !== "idle";

  return (
    <Screen width="wide">
      <ConnectionBadge />

      <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="space-y-4 text-center sm:text-left">
          <Eyebrow>{gm.codeLabel}</Eyebrow>
          <RoomCode code={shown} size="wall" />
          <div className="space-y-1">
            <Eyebrow>{gm.joinAt}</Eyebrow>
            <p className="text-lead break-all text-muted-foreground">{origin}</p>
          </div>
        </div>

        {/* The wall-sized version of "type this in": a camera does it faster. */}
        <div className="mx-auto w-44 space-y-2 sm:w-56 lg:w-64">
          <QrCode value={link} className="p-3" />
          <p className="text-center text-small text-faint">{qr.scan}</p>
        </div>
      </div>

      {/* The clock beside the standings rather than over them: a room reads
          both at once, and stacked they are two screenfuls on the one screen
          nobody can scroll. The clock's column is sized by the clock — a
          number set at 9rem is as wide as it is, and `auto` gives it that
          rather than a guess that "360:00" would overflow. */}
      <div
        className={`grid gap-8 lg:items-start ${
          onTheClock ? "lg:grid-cols-[auto_minmax(0,1fr)]" : ""
        }`}
      >
        <TimerHeader size="wall" />

        <Card>
          <SectionHeader label={strings.standings} aside={lobby.count(participants.length)} />
          {/* Names one step up from body text: still a list, but a list being
              read from the back of the room. Hidden means hidden here too —
              this is the screen everybody is looking at. */}
          <div className="text-lead">
            <Standings withheld={room?.scoresVisible === false} />
          </div>
        </Card>
      </div>

      <div className="mt-auto space-y-3">
        <Note className="text-center">{strings.stub}</Note>
        <LanguageSwitch />
      </div>
    </Screen>
  );
}
