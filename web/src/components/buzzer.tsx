/**
 * The press is timestamped in the click handler, never from anything React
 * rendered: a captured value is a frame old, and a frame is 16ms of a round
 * that 20ms can decide.
 */
import { useEffect, useState } from "react";
import { Label, Note } from "@/components/ui";
import { useSocket } from "@/lib/socket-provider";
import { t } from "@/i18n";

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

export function Buzzer({ participantId }: { participantId?: string }) {
  const { round, presses, participants, clock, emit } = useSocket();
  const strings = t().buzzer;
  // So the UI answers the thumb, not the network two round trips away.
  const [sentRoundId, setSentRoundId] = useState<string | null>(null);

  const mine = presses.find((press) => press.participantId === participantId);
  const winner = presses[0];
  const winnerName =
    participants.find((participant) => participant.id === winner?.participantId)?.name ?? null;
  const lockedOut = round?.locked === true && winner !== undefined && mine === undefined;
  const pending = sentRoundId === round?.roundId && mine === undefined && !lockedOut;

  useEffect(() => {
    if (round === null) setSentRoundId(null);
  }, [round]);

  useEffect(() => {
    if (mine?.rank === 1) vibrate(60);
  }, [mine?.rank]);

  if (round === null) {
    return (
      <div className="space-y-1 py-6 text-center">
        <Label>{strings.waiting}</Label>
        <Note>{strings.waitingNote}</Note>
      </div>
    );
  }

  function press() {
    if (!round || mine || lockedOut) return;
    const now = Date.now();
    const reading = clock.current.read(now);

    setSentRoundId(round.roundId);
    vibrate(20);
    emit("buzz:press", {
      roundId: round.roundId,
      clientSentAt: now,
      // Sent even when unusable: the sample count tells the server to fall back.
      clockOffsetMs: reading.offsetMs,
      clockDelayMs: reading.delayMs,
      sampleCount: reading.sampleCount,
      jitterMs: reading.jitterMs,
    });
  }

  return (
    <div className="space-y-4">
      {round.label ? (
        <p className="text-center text-small text-ink-muted">{round.label}</p>
      ) : null}

      <button
        onClick={press}
        disabled={mine !== undefined || lockedOut}
        aria-label={strings.pressLabel}
        data-testid="buzz-button"
        className={`numeric flex min-h-[9rem] w-full items-center justify-center
          rounded-md font-semibold transition-colors duration-150 select-none
          disabled:cursor-not-allowed
          ${
            lockedOut
              ? "text-title"
              : "text-[clamp(2rem,11vw,3.5rem)] tracking-code"
          }
          ${buttonTone(mine !== undefined, lockedOut, pending)}`}
      >
        {buttonText(mine !== undefined, lockedOut, pending, strings)}
      </button>

      <BuzzStatus
        mine={mine}
        lockedOut={lockedOut}
        winnerName={winnerName}
        unlocked={round.locked === false}
      />
    </div>
  );
}

function buttonTone(pressed: boolean, lockedOut: boolean, pending: boolean): string {
  if (lockedOut) return "border border-rule-strong bg-sunken text-ink-faint";
  if (pressed) return "border border-success bg-success-tint text-success";
  if (pending) return "bg-accent-hover text-on-accent";
  return "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover";
}

function buttonText(
  pressed: boolean,
  lockedOut: boolean,
  pending: boolean,
  strings: ReturnType<typeof t>["buzzer"],
): string {
  if (lockedOut) return strings.lockedOut;
  if (pressed) return strings.press;
  if (pending) return strings.sending;
  return strings.press;
}

function BuzzStatus({
  mine,
  lockedOut,
  winnerName,
  unlocked,
}: {
  mine: { rank: number; deltaMs: number } | undefined;
  lockedOut: boolean;
  winnerName: string | null;
  unlocked: boolean;
}) {
  const strings = t().buzzer;

  if (mine) {
    return (
      <div className="space-y-1 text-center">
        <p className="text-lead font-medium text-ink">
          {mine.rank === 1 ? strings.youWon : strings.youPlaced(mine.rank)}
        </p>
        {/* The gap that decided it — the number worth arguing about. */}
        {mine.deltaMs > 0 ? <Note>{strings.behindBy(mine.deltaMs)}</Note> : null}
      </div>
    );
  }

  if (lockedOut) {
    return winnerName ? (
      <Note className="text-center">{strings.lockedOutNote(winnerName)}</Note>
    ) : null;
  }

  return unlocked ? <Note className="text-center">{strings.unlocked}</Note> : null;
}
