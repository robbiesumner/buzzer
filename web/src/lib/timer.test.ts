import { describe, expect, it } from "vitest";
import { TIMER_MAX_MS, type TimerView } from "./protocol";
import {
  formatDuration,
  formatGap,
  formatPreset,
  parseSeconds,
  remainingMs,
  timerTone,
} from "./timer";

function timer(overrides: Partial<TimerView> = {}): TimerView {
  return {
    state: "idle",
    label: null,
    durationMs: 60000,
    endsAt: null,
    remainingMs: 60000,
    serverNow: 1_000_000,
    ...overrides,
  };
}

describe("remainingMs", () => {
  it("counts a running timer down against the server clock", () => {
    // A phone whose own clock is minutes out still counts down in step.
    const running = timer({ state: "running", endsAt: 1_030_000 });
    expect(remainingMs(running, 1_000_000)).toBe(30000);
    expect(remainingMs(running, 1_025_000)).toBe(5000);
  });

  it("never goes negative", () => {
    const running = timer({ state: "running", endsAt: 1_030_000 });
    expect(remainingMs(running, 1_099_000)).toBe(0);
  });

  it("holds a paused timer still", () => {
    const paused = timer({ state: "paused", endsAt: null, remainingMs: 12345 });
    expect(remainingMs(paused, 1_000_000)).toBe(12345);
    expect(remainingMs(paused, 9_000_000)).toBe(12345);
  });

  it("shows an idle timer the duration Start will run", () => {
    expect(remainingMs(timer(), 1_000_000)).toBe(60000);
  });

  it("gives an expired timer nothing left", () => {
    expect(remainingMs(timer({ state: "expired", remainingMs: 5000 }), 1_000_000)).toBe(0);
  });

  it("copes with no timer at all", () => {
    expect(remainingMs(null, 1_000_000)).toBe(0);
  });
});

describe("timerTone", () => {
  it("stays neutral while there is time", () => {
    expect(timerTone(timer({ state: "running" }), 30000)).toBe("neutral");
  });

  it("warns under ten seconds", () => {
    expect(timerTone(timer({ state: "running" }), 9999)).toBe("warn");
  });

  it("goes to danger at zero and when expired", () => {
    expect(timerTone(timer({ state: "running" }), 0)).toBe("danger");
    expect(timerTone(timer({ state: "expired" }), 0)).toBe("danger");
  });

  it("leaves an idle timer alone however small the duration", () => {
    expect(timerTone(timer({ durationMs: 5000 }), 5000)).toBe("neutral");
  });
});

describe("formatDuration", () => {
  it("rounds up, so 0:00 means no time left", () => {
    expect(formatDuration(60000)).toBe("1:00");
    expect(formatDuration(59001)).toBe("1:00");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("pads the seconds", () => {
    expect(formatDuration(65000)).toBe("1:05");
    expect(formatDuration(125000)).toBe("2:05");
  });

  it("shows tenths in the last ten seconds", () => {
    expect(formatDuration(9500)).toBe("9.5");
    expect(formatDuration(1000)).toBe("1.0");
    expect(formatDuration(100)).toBe("0.1");
  });

  it("clamps a negative remainder", () => {
    expect(formatDuration(-5000)).toBe("0:00");
  });
});

describe("formatPreset", () => {
  it("names each preset the way a GM would say it", () => {
    expect(formatPreset(15000)).toBe("15s");
    expect(formatPreset(60000)).toBe("1m");
    expect(formatPreset(120000)).toBe("2m");
    expect(formatPreset(90000)).toBe("1:30");
  });
});

describe("formatGap", () => {
  it("signs a buzz gap with a real minus sign", () => {
    expect(formatGap(150)).toBe("+150ms");
    expect(formatGap(-80)).toBe("−80ms");
    expect(formatGap(0)).toBe("0ms");
  });
});

describe("parseSeconds", () => {
  it("accepts a plain number of seconds", () => {
    expect(parseSeconds("90")).toBe(90);
    expect(parseSeconds("  45 ")).toBe(45);
  });

  it("rejects anything that is not a duration", () => {
    expect(parseSeconds("")).toBeNull();
    expect(parseSeconds("abc")).toBeNull();
    expect(parseSeconds("1.5")).toBeNull();
    expect(parseSeconds("-30")).toBeNull();
    expect(parseSeconds("0")).toBeNull();
  });

  it("rejects a duration longer than the server will take", () => {
    const maxSeconds = TIMER_MAX_MS / 1000;
    expect(parseSeconds(String(maxSeconds))).toBe(maxSeconds);
    expect(parseSeconds(String(maxSeconds + 1))).toBeNull();
  });
});
