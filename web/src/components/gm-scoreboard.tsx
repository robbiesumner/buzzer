import { useState } from "react";
import { SCORE_DELTA_MAX, SCORE_QUICK_DELTAS, SCORE_REASON_MAX } from "@/lib/protocol";
import type { ParticipantView } from "@/lib/protocol";
import { type Emit, useSocket } from "@/lib/socket-provider";
import { Field, StepButton, TextButton } from "@/components/ui";
import { t } from "@/i18n";

/** A real minus sign (U+2212), not a hyphen. */
function formatDelta(delta: number): string {
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
}

/** Shared so the same four buttons follow a participant onto the buzzer panel. */
export function ScoreSteppers({ participant }: { participant: ParticipantView }) {
  const { emit } = useSocket();
  const strings = t().gm;

  return (
    <div className="grid grid-cols-4 gap-2">
      {SCORE_QUICK_DELTAS.map((delta) => (
        <StepButton
          key={delta}
          aria-label={strings.deltaLabel(participant.name, delta)}
          onClick={() => emit("score:adjust", { participantId: participant.id, delta })}
        >
          {formatDelta(delta)}
        </StepButton>
      ))}
    </div>
  );
}

export function parseDelta(value: string): number | null {
  const trimmed = value.trim().replace("−", "-");
  if (!/^-?\d+$/.test(trimmed)) return null;
  const delta = Number(trimmed);
  if (delta === 0 || Math.abs(delta) > SCORE_DELTA_MAX) return null;
  return delta;
}

/** Join order, not score order: a row that jumps is a row the next click misses. */
export function GmScoreboard() {
  const { participants } = useSocket();
  const lobby = t().lobby;

  if (participants.length === 0) {
    return <p className="py-8 text-center text-small text-ink-faint">{lobby.empty}</p>;
  }

  return (
    <ul className="divide-y divide-rule">
      {participants.map((participant) => (
        <ScoreRow key={participant.id} participant={participant} />
      ))}
    </ul>
  );
}

function ScoreRow({ participant }: { participant: ParticipantView }) {
  const { emit } = useSocket();
  const strings = t().gm;
  const lobby = t().lobby;
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <li className="space-y-2 py-4">
      <div className="flex items-center gap-3">
        <span
          aria-label={participant.connected ? lobby.connected : lobby.disconnected}
          title={participant.connected ? lobby.connected : lobby.disconnected}
          className={`size-1.5 shrink-0 rounded-full ${
            participant.connected ? "bg-success" : "bg-rule-strong"
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-ink">{participant.name}</span>
        <span className="numeric text-lead font-semibold text-ink tabular-nums">
          {participant.score ?? 0}
        </span>
      </div>

      <ScoreSteppers participant={participant} />

      <div className="flex items-center justify-between">
        <TextButton
          aria-label={strings.customLabel(participant.name)}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
        >
          {customOpen ? strings.customCancel : strings.custom}
        </TextButton>
        <TextButton
          aria-label={strings.undoLabel(participant.name)}
          onClick={() => emit("score:undo", { participantId: participant.id })}
        >
          {strings.undo}
        </TextButton>
      </div>

      {customOpen ? (
        <CustomAdjustment
          participant={participant}
          emit={emit}
          onDone={() => setCustomOpen(false)}
        />
      ) : null}
    </li>
  );
}

function CustomAdjustment({
  participant,
  emit,
  onDone,
}: {
  participant: ParticipantView;
  emit: Emit;
  onDone: () => void;
}) {
  const strings = t().gm;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const delta = parseDelta(amount);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (delta === null) return;
    emit("score:adjust", {
      participantId: participant.id,
      delta,
      reason: reason.trim() || null,
    });
    setAmount("");
    setReason("");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-l border-rule-strong pt-1 pl-3">
      <Field
        label={strings.customAmount}
        placeholder={strings.customAmountPlaceholder}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="numeric"
        autoComplete="off"
        className="numeric"
        autoFocus
      />
      <Field
        label={strings.customReason}
        placeholder={strings.customReasonPlaceholder}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={SCORE_REASON_MAX}
        autoComplete="off"
      />
      <StepButton type="submit" disabled={delta === null}>
        {delta === null ? strings.customApply : `${strings.customApply} ${formatDelta(delta)}`}
      </StepButton>
    </form>
  );
}

export function ScoreVisibilityToggle() {
  const { room, emit } = useSocket();
  const strings = t().gm;
  const hidden = room?.scoresVisible === false;

  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-rule pt-4">
      <span className={`text-small ${hidden ? "text-warn" : "text-ink-faint"}`}>
        {hidden ? strings.scoresHiddenNote : strings.scoresVisibleNote}
      </span>
      <TextButton onClick={() => emit("room:setScoresVisible", { visible: hidden })}>
        {hidden ? strings.showScores : strings.hideScores}
      </TextButton>
    </div>
  );
}
