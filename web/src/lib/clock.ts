/**
 * An SNTP-style exchange, with t1 == t2 because the server answers a ping in one
 * synchronous handler — which is why a pong carries a single `serverNow`:
 *
 *     offset = serverNow - (t0 + t3) / 2    device clock -> server clock
 *     delay  = t3 - t0                      round trip
 */
import { BUZZ_MIN_SAMPLES, BUZZ_SAMPLE_MAX_AGE_MS, BUZZ_SAMPLE_WINDOW } from "./protocol";

export interface ClockSample {
  offsetMs: number;
  delayMs: number;
  takenAt: number;
}

export interface ClockReading {
  /** Add to a local timestamp to get server time. */
  offsetMs: number;
  delayMs: number;
  jitterMs: number;
  sampleCount: number;
  usable: boolean;
}

const UNMEASURED: ClockReading = {
  offsetMs: 0,
  delayMs: 0,
  jitterMs: 0,
  sampleCount: 0,
  usable: false,
};

/**
 * Deliberately not a React hook: the buzzer reads the offset inside the click
 * handler, and a value captured by a render is already a frame old.
 */
export class Clock {
  private samples: ClockSample[] = [];

  /** `now` is the device clock at t3. */
  addSample(clientSentAt: number, serverNow: number, now: number): void {
    const roundTrip = now - clientSentAt;
    // The device clock jumped mid-exchange, so the sample spans two clocks.
    if (roundTrip < 0) return;

    this.samples.push({
      offsetMs: Math.round(serverNow - (clientSentAt + now) / 2),
      delayMs: Math.round(roundTrip),
      takenAt: now,
    });
    if (this.samples.length > BUZZ_SAMPLE_WINDOW) this.samples.shift();
  }

  private fresh(now: number): ClockSample[] {
    return this.samples.filter((sample) => now - sample.takenAt < BUZZ_SAMPLE_MAX_AGE_MS);
  }

  /**
   * The offset comes from the lowest-delay sample, not an average: the NTP
   * minimum filter. A packet that was not delayed cannot have been distorted,
   * whereas averaging lets one slow round trip drag the estimate.
   */
  read(now: number = Date.now()): ClockReading {
    const fresh = this.fresh(now);
    if (fresh.length === 0) return UNMEASURED;

    const best = fresh.reduce((a, b) => (b.delayMs < a.delayMs ? b : a));
    const offsets = fresh.map((sample) => sample.offsetMs);

    return {
      offsetMs: best.offsetMs,
      delayMs: best.delayMs,
      jitterMs: Math.round(Math.max(...offsets) - Math.min(...offsets)),
      sampleCount: fresh.length,
      usable: fresh.length >= BUZZ_MIN_SAMPLES,
    };
  }

  serverNow(now: number = Date.now()): number {
    return now + this.read(now).offsetMs;
  }

  clear(): void {
    this.samples = [];
  }
}
