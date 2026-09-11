import { useEffect, useState } from "react";
import { Countdown, Label, type Scale } from "@/components/ui";
import { useSocket } from "@/lib/socket-provider";
import { formatDuration, remainingMs, timerTone } from "@/lib/timer";
import { t } from "@/i18n";

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

export function useRemaining(): number {
  const { timer, clock } = useSocket();
  const [remaining, setRemaining] = useState(() => remainingMs(timer, clock.current.serverNow()));

  useEffect(() => {
    const read = () => setRemaining(remainingMs(timer, clock.current.serverNow()));
    read();
    // A held number needs no frame loop.
    if (timer?.state !== "running") return;

    let frame = requestAnimationFrame(function tick() {
      read();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [timer, clock]);

  return remaining;
}

export function TimerHeader({ size = "hero" }: { size?: Scale }) {
  const { timer, expired } = useSocket();
  const remaining = useRemaining();
  const strings = t().timer;

  useEffect(() => {
    if (expired) vibrate([80, 60, 80]);
  }, [expired]);

  if (!timer || timer.state === "idle") return null;

  const tone = timerTone(timer, remaining);
  const heading =
    timer.state === "expired"
      ? strings.expired
      : timer.state === "paused"
        ? // Spelled out, so a frozen number never reads as a frozen app.
          strings.paused
        : strings.running;

  return (
    <section
      data-testid="timer-header"
      className="space-y-1 rounded-md border border-rule bg-surface px-6 py-4 text-center"
    >
      <Label>{heading}</Label>
      <Countdown value={formatDuration(remaining)} tone={tone} size={size} />
      {timer.label ? <p className="text-small text-ink-muted">{timer.label}</p> : null}
    </section>
  );
}
