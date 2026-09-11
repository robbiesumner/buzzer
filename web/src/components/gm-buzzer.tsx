/**
 * A ranking that decides a round has to be arguable with, so every row shows
 * both gaps, the correction applied, and that device's delay and jitter.
 */
import { useState } from "react";
import { ScoreSteppers } from "@/components/gm-scoreboard";
import { Button, Field, Label, Note, SectionHeader, TextButton } from "@/components/ui";
import { LABEL_MAX, type BuzzPressView, type ParticipantView } from "@/lib/protocol";
import { useSocket } from "@/lib/socket-provider";
import { formatGap } from "@/lib/timer";
import { t } from "@/i18n";

export function GmBuzzer() {
  const { round, presses, emit } = useSocket();
  const strings = t().gm.buzz;
  const [label, setLabel] = useState("");
  const [locked, setLocked] = useState(true);

  // An armed round's setting wins; `locked` is what the next Arm will use.
  const isLocked = round?.locked ?? locked;

  function toggleLock() {
    setLocked(!isLocked);
    if (round) emit("buzz:setLocked", { roundId: round.roundId, locked: !isLocked });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Field
          label={strings.labelField}
          placeholder={strings.labelPlaceholder}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={LABEL_MAX}
          autoComplete="off"
        />

        {/* One lock control, in one place. Before a round it chooses what Arm
            will do; during one it flips the live round, which is how "first
            buzz wins" becomes "first three count" without losing the presses
            already in (SPEC.md section 7.2). */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-small text-ink-faint">
            {isLocked ? strings.lockedOnNote : strings.lockedOffNote}
          </span>
          {/* The button says what pressing it does, not what is already true. */}
          <TextButton onClick={toggleLock} className="shrink-0 whitespace-nowrap">
            {isLocked ? strings.lockedOff : strings.lockedOn}
          </TextButton>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => emit("buzz:arm", { label: label.trim() || null, locked })}>
            {round ? strings.rearm : strings.arm}
          </Button>
          <Button variant="ghost" disabled={!round} onClick={() => emit("buzz:reset")}>
            {strings.clear}
          </Button>
        </div>
      </div>

      <div>
        <SectionHeader
          label={strings.title}
          aside={round ? (round.label ?? strings.armed) : strings.idle}
        />

        {round && presses.length > 0 ? (
          <ol className="divide-y divide-rule">
            {presses.map((press) => (
              <PressRow key={press.participantId} press={press} />
            ))}
          </ol>
        ) : (
          <p className="py-8 text-center text-small text-ink-faint">
            {round ? strings.noPresses : strings.idle}
          </p>
        )}
      </div>
    </div>
  );
}

function PressRow({ press }: { press: BuzzPressView }) {
  const { participants } = useSocket();
  const strings = t().gm.buzz;
  const participant: ParticipantView | undefined = participants.find(
    (candidate) => candidate.id === press.participantId,
  );

  return (
    <li data-testid="press-row" className="space-y-2 py-4">
      <div className="flex items-baseline gap-3">
        <span className="numeric w-5 shrink-0 text-right text-small text-ink-faint">
          {press.rank}
        </span>
        <span className="min-w-0 flex-1 truncate text-ink">{participant?.name ?? "—"}</span>
        {/* The number that decided the round, given the weight to match. */}
        <span className="numeric text-lead font-semibold text-ink tabular-nums">
          {press.rank === 1 ? "—" : formatGap(press.deltaMs)}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 pl-8">
        <Stat
          testId="press-arrival"
          label={strings.arrivalHeader}
          value={formatGap(press.arrivalDeltaMs)}
        />
        <Stat label={strings.correctionHeader} value={formatGap(press.compensationMs)} />
        <Stat
          label={strings.connectionHeader}
          value={strings.connection(press.delayMs, press.jitterMs)}
        />
      </dl>

      {/* Only shown when something was adjusted, so a marker always means something. */}
      {!press.compensated ? (
        <Flag text={strings.uncompensated} note={strings.uncompensatedNote} />
      ) : null}
      {press.clamped ? <Flag text={strings.clamped} note={strings.clampedNote} /> : null}

      {/* Scoring stays manual: the same controls, pre-targeted (SPEC.md 7.3).
          Gone once someone leaves — there is nobody left to award. */}
      {participant ? (
        <div className="pl-8">
          <ScoreSteppers participant={participant} />
        </div>
      ) : null}
    </li>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <dt>
        <Label>{label}</Label>
      </dt>
      <dd data-testid={testId} className="numeric text-small text-ink-muted tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function Flag({ text, note }: { text: string; note: string }) {
  return (
    <div className="ml-8 border-l-2 border-warn pl-3">
      <p className="text-label font-medium tracking-label text-warn uppercase">{text}</p>
      <Note>{note}</Note>
    </div>
  );
}
