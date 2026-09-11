import { useState } from "react";
import { useRemaining } from "@/components/countdown";
import { Countdown, Field, Label, Note, StepButton, TextButton } from "@/components/ui";
import { TIMER_ADD_MS, TIMER_PRESETS_MS } from "@/lib/protocol";
import { useSocket } from "@/lib/socket-provider";
import { formatDuration, formatPreset, parseSeconds, timerTone } from "@/lib/timer";
import { t } from "@/i18n";

export function GmTimerBar() {
  const { timer, emit } = useSocket();
  const remaining = useRemaining();
  const strings = t().gm.timer;
  const timerStrings = t().timer;
  const [custom, setCustom] = useState("");
  const [label, setLabel] = useState("");
  const [open, setOpen] = useState(false);

  const state = timer?.state ?? "idle";
  const running = state === "running";
  const startable = (timer?.durationMs ?? 0) > 0;

  function setDuration(durationMs: number) {
    emit("timer:set", { durationMs, label: label.trim() || null });
  }

  const heading =
    state === "expired"
      ? timerStrings.expired
      : state === "paused"
        ? timerStrings.paused
        : running
          ? timerStrings.running
          : strings.idle;

  return (
    <section
      className="rounded-md border border-rule bg-surface p-6
        lg:flex lg:items-center lg:gap-8"
    >
      <div className="space-y-1 text-center lg:w-56 lg:shrink-0">
        <Label>{heading}</Label>
        <Countdown value={formatDuration(remaining)} tone={timerTone(timer, remaining)} />
        {timer?.label ? <p className="text-small text-ink-muted">{timer.label}</p> : null}
      </div>

      <div className="mt-4 min-w-0 space-y-4 lg:mt-0 lg:flex-1">
        <div className="flex items-baseline justify-end">
          <TextButton aria-expanded={open} onClick={() => setOpen((current) => !current)}>
            {open ? strings.done : strings.configure}
          </TextButton>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {running ? (
            <StepButton onClick={() => emit("timer:pause")}>{strings.pause}</StepButton>
          ) : (
            <StepButton
              disabled={!startable}
              onClick={() => emit(state === "paused" ? "timer:resume" : "timer:start")}
            >
              {state === "paused" ? strings.resume : strings.start}
            </StepButton>
          )}
          <StepButton onClick={() => emit("timer:addTime", { deltaMs: TIMER_ADD_MS })}>
            {strings.add}
          </StepButton>
          <StepButton onClick={() => emit("timer:reset")}>{strings.reset}</StepButton>
        </div>

        {!startable ? <Note>{strings.noDuration}</Note> : null}

        {open ? (
          <div className="space-y-3 border-t border-rule pt-4">
            <div className="grid grid-cols-5 gap-2">
              {TIMER_PRESETS_MS.map((preset) => (
                <StepButton key={preset} onClick={() => setDuration(preset)}>
                  {formatPreset(preset)}
                </StepButton>
              ))}
            </div>

            <Field
              label={strings.labelField}
              placeholder={strings.labelPlaceholder}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              autoComplete="off"
            />

            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const seconds = parseSeconds(custom);
                if (seconds === null) return;
                setDuration(seconds * 1000);
                setCustom("");
              }}
            >
              <div className="flex-1">
                <Field
                  label={strings.customField}
                  placeholder={strings.customPlaceholder}
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  className="numeric"
                />
              </div>
              <StepButton type="submit" disabled={parseSeconds(custom) === null} className="w-24">
                {strings.set}
              </StepButton>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  );
}
