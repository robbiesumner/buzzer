import { useEffect, useState } from "react";
import { Countdown, Eyebrow, type Scale } from "@/components/kit";
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
      // Colour only, never size: `/present` is read at six metres and the
      // digits must not reflow (DESIGN.md section 6).
      className={`space-y-1 rounded-md border border-border bg-card px-6 py-4 text-center
        ${expired ? "animate-expire" : ""}`}
    >
      <Eyebrow>{heading}</Eyebrow>
      <Countdown value={formatDuration(remaining)} tone={tone} size={size} />
      {timer.label ? <p className="text-small text-muted-foreground">{timer.label}</p> : null}
    </section>
  );
}
