import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ConnectionBadge } from "@/components/connection-badge";
import { GmBuzzer } from "@/components/gm-buzzer";
import { GmScoreboard, ScoreVisibilityToggle } from "@/components/gm-scoreboard";
import { GmTimerBar } from "@/components/gm-timer";
import { LanguageSwitch } from "@/components/language-switch";
import { QrCode } from "@/components/qr-code";
import {
  Button,
  Card,
  ErrorNote,
  Heading,
  Label,
  Panel,
  RoomCode,
  Screen,
  SectionHeader,
  Tabs,
  TextButton,
} from "@/components/ui";
import { useJoinLink } from "@/lib/join-url";
import { useWideLayout } from "@/lib/media";
import { SocketProvider, useSocket } from "@/lib/socket-provider";
import { clearSession, loadSession, type StoredSession } from "@/lib/session";
import { t } from "@/i18n";

export function GmRoomRoute() {
  const navigate = useNavigate();
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    const stored = loadSession("gm", code);
    if (!stored) navigate("/gm", { replace: true });
    setSession(stored);
  }, [code, navigate]);

  if (!session) return null;

  return (
    <SocketProvider token={session.token}>
      <GmLobby session={session} onSignOut={() => setSession(null)} />
    </SocketProvider>
  );
}

type TabId = "participants" | "buzzer";

function GmLobby({ session, onSignOut }: { session: StoredSession; onSignOut: () => void }) {
  const navigate = useNavigate();
  const { room, participants, error } = useSocket();
  const strings = t().gm;
  const errors = t().eventErrors;
  const wide = useWideLayout();
  const code = room?.code ?? session.code;

  function signOut() {
    clearSession("gm", session.code);
    onSignOut();
    navigate("/gm", { replace: true });
  }

  const banner = (
    <>
      <ConnectionBadge />
      {/* A refused event: the wrong player id, or nothing left to undo. */}
      {error ? (
        <ErrorNote>{errors[error as keyof typeof errors] ?? errors.unknown}</ErrorNote>
      ) : null}
    </>
  );

  if (!wide) {
    return (
      <Screen>
        <Heading title={strings.panelTitle} />
        {banner}
        <RoomCard code={code} />
        {/* Above the tabs on purpose: the clock is always one click away,
            whatever the GM happens to be looking at (SPEC.md section 7.5). */}
        <GmTimerBar />
        <TabbedSections participants={participants.length} />
        <div className="mt-auto space-y-4">
          {/* The projector view, on the laptop that is already signed in. */}
          <PresentLink code={code} className="block text-center" />
          <Button variant="ghost" onClick={signOut}>
            {strings.close}
          </Button>
          <LanguageSwitch />
        </div>
      </Screen>
    );
  }

  return (
    <Screen width="wide">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <Heading title={strings.panelTitle} />
        <div className="flex items-center gap-5">
          <PresentLink code={code} />
          <TextButton onClick={signOut}>{strings.close}</TextButton>
          <LanguageSwitch />
        </div>
      </div>
      {banner}

      {/* The room's own header: what the room needs to join, and the clock the
          whole room is on. Both stay above every section rather than inside
          one, because both are true of the evening rather than of a tab. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <RoomCard code={code} inline />
        <GmTimerBar />
      </div>

      <WideSections participants={participants.length} />
    </Screen>
  );
}

function WideSections({ participants }: { participants: number }) {
  const strings = t().gm;
  const lobby = t().lobby;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel
        label={strings.tabs.participants}
        aside={lobby.count(participants)}
        scroll
        footer={<ScoreVisibilityToggle />}
      >
        <GmScoreboard />
      </Panel>

      <Panel label={strings.tabs.buzzer} scroll>
        <GmBuzzer />
      </Panel>

    </div>
  );
}

function TabbedSections({ participants }: { participants: number }) {
  const strings = t().gm;
  const lobby = t().lobby;
  const [tab, setTab] = useState<TabId>("participants");

  const tabs = [
    { id: "participants" as const, label: strings.tabs.participants },
    { id: "buzzer" as const, label: strings.tabs.buzzer },
  ];

  return (
    <>
      <Tabs tabs={tabs} active={tab} onSelect={setTab} />
      <Card>
        {tab === "participants" ? (
          <>
            <SectionHeader label={strings.scores} aside={lobby.count(participants)} />
            <GmScoreboard />
            <ScoreVisibilityToggle />
          </>
        ) : (
          <GmBuzzer />
        )}
      </Card>
    </>
  );
}

/** `inline` sets the QR beside the code, for the wide layout's header row. */
function RoomCard({ code, inline = false }: { code: string; inline?: boolean }) {
  const strings = t().gm;
  const qrStrings = t().qr;
  const [copied, setCopied] = useState(false);
  const { origin, link } = useJoinLink(code);

  async function copyLink() {
    try {
      // The link, not the origin: pasted into a chat it carries the code.
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Needs a secure context; the URL is on screen either way.
    }
  }

  const address = (
    <>
      <Label>{strings.joinAt}</Label>
      <p className="text-small break-all text-ink-muted">{origin}</p>
      <TextButton onClick={copyLink}>{copied ? strings.copied : strings.copy}</TextButton>
    </>
  );

  if (inline) {
    return (
      <Card className="flex items-center gap-5">
        <div className="min-w-0 flex-1">
          <Label>{strings.codeLabel}</Label>
          <div className="mt-1">
            <RoomCode code={code} size="display" />
          </div>
          <div className="mt-3 space-y-1 border-t border-rule pt-3">{address}</div>
        </div>
        {/* Thirty people typing a URL is thirty chances to mistype it. */}
        <div className="w-28 shrink-0 space-y-1">
          <QrCode value={link} className="p-1.5" />
          <p className="text-center text-small text-ink-faint">{qrStrings.scan}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <Label>{strings.codeLabel}</Label>
      <div className="mt-3">
        <RoomCode code={code} />
      </div>
      <div className="mt-5 space-y-1 border-t border-rule pt-4">{address}</div>
      <div className="mt-5 border-t border-rule pt-4">
        <div className="mx-auto w-40">
          <QrCode value={link} className="p-2" />
        </div>
        <p className="mt-2 text-small text-ink-faint">{qrStrings.scan}</p>
      </div>
    </Card>
  );
}

function PresentLink({ code, className = "" }: { code: string; className?: string }) {
  return (
    <Link
      to={`/present/${code}`}
      target="_blank"
      rel="noreferrer"
      className={`text-small text-ink-muted underline decoration-rule-strong
        underline-offset-4 hover:text-ink ${className}`}
    >
      {t().gm.present}
    </Link>
  );
}
