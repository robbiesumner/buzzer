import { TIMER_MAX_MS, TIMER_WARN_MS, type TimerView } from "./protocol";

export function remainingMs(timer: TimerView | null, serverNow: number): number {
  if (!timer) return 0;
  if (timer.state === "running" && timer.endsAt !== null) {
    return Math.max(0, timer.endsAt - serverNow);
  }
  // Paused and idle carry their own number; expired has none left.
  return timer.state === "expired" ? 0 : timer.remainingMs;
}

export type TimerTone = "neutral" | "warn" | "danger";

export function timerTone(timer: TimerView | null, remaining: number): TimerTone {
  if (!timer || timer.state === "idle") return "neutral";
  if (timer.state === "expired" || remaining <= 0) return "danger";
  if (timer.state === "running" && remaining < TIMER_WARN_MS) return "warn";
  return "neutral";
}

/**
 * Rounds *up*, which is what makes the display honest: 0:01 still has time on
 * it, 0:00 has none.
 */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < TIMER_WARN_MS && safe > 0) {
    const tenths = Math.ceil(safe / 100);
    return `${Math.floor(tenths / 10)}.${tenths % 10}`;
  }

  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPreset(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Uses a real minus sign (U+2212), not a hyphen. */
export function formatGap(ms: number): string {
  if (ms === 0) return "0ms";
  return `${ms > 0 ? "+" : "−"}${Math.abs(ms)}ms`;
}

export function parseSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  // The server's bound, so Set disables rather than sending a doomed payload.
  return seconds > 0 && seconds * 1000 <= TIMER_MAX_MS ? seconds : null;
}
